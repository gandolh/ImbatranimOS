// In-memory DB so this e2e never touches real data.
process.env.DB_PATH = ":memory:";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { execFileSync } from "child_process";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import type { Server } from "http";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";

import { ConfigModule } from "../src/config/config.module";
import { DbModule } from "../src/db/db.module";
import { DbService } from "../src/db/db.service";
import { AppDataModule } from "../src/modules/app-data/app-data.module";
import { SetAsideService } from "../src/modules/app-data/set-aside.service";
import { FilesService } from "../src/modules/files/files.service";
import { AppIdentityModule } from "../src/modules/app-identity/app-identity.module";
import { APP_TOKEN_HEADER } from "../src/modules/app-identity/app-identity.types";
import { USER_ONLY } from "../src/modules/app-identity/calling-app";
import { IdentityTestModule, TEST_COOKIE } from "../src/modules/identity/testing";

describe("Set-aside older data (e2e)", () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let home: string;
  let db: DbService["db"];
  const prevRoot = process.env.FILES_ROOT;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "imb-old-data-e2e-"));
    process.env.FILES_ROOT = home;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, DbModule, IdentityTestModule, AppIdentityModule, AppDataModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());
    db = app.get(DbService).db;
    db.prepare(
      `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, installed_at)
         VALUES ('hollow', 'abc', 'b1', '/x', 'dist/hollow.js', 1)`,
    ).run();
  });

  afterEach(async () => {
    await app.close();
    process.env.FILES_ROOT = prevRoot;
    rmSync(home, { recursive: true, force: true });
  });

  /** Tables as the moves set them aside, with the moved tables' columns. */
  function setAside(): void {
    db.exec(`
      CREATE TABLE todos_premove_20261109 (
        id INTEGER PRIMARY KEY, text TEXT, completed INTEGER, position INTEGER,
        due_at INTEGER, priority INTEGER, list_id INTEGER,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE todo_lists_premove_20261109 (
        id INTEGER PRIMARY KEY, name TEXT, position INTEGER);
      CREATE TABLE todos_premove_20261109_2 (
        id INTEGER PRIMARY KEY, text TEXT, completed INTEGER, position INTEGER,
        due_at INTEGER, priority INTEGER, list_id INTEGER,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE bookmark_groups_premove_20261109 (
        id INTEGER PRIMARY KEY, name TEXT, icon TEXT, parent_id INTEGER,
        position INTEGER);
      CREATE TABLE bookmark_links_premove_20261109 (
        id INTEGER PRIMARY KEY, group_id INTEGER, title TEXT, url TEXT,
        icon TEXT, position INTEGER);
      CREATE TABLE notes_premove_20261109 (id INTEGER PRIMARY KEY);

      INSERT INTO todo_lists_premove_20261109 VALUES (3, 'Errands', 2);
      INSERT INTO todos_premove_20261109 VALUES
        (7, 'Milk', 1, 4, 1762700000000, 1, 3,
         '2026-11-01 10:00:00', '2026-11-02 11:00:00');
      INSERT INTO todos_premove_20261109_2 VALUES
        (9, 'Call home', 0, 1, NULL, 0, NULL,
         '2026-11-03 09:00:00', '2026-11-03 09:00:00');
      INSERT INTO bookmark_groups_premove_20261109 VALUES (5, 'News', NULL, NULL, 6);
      INSERT INTO bookmark_links_premove_20261109 VALUES
        (11, 5, 'Paper', 'https://example.com/', NULL, 8);
    `);
  }

  async function appToken(): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await http
      .post("/api/system/app-tokens")
      .set("Cookie", TEST_COOKIE)
      .send({ token, appId: "hollow", instanceId: "hollow-1", windowId: null })
      .expect(201);
    return token;
  }

  const status = async () =>
    (await http.get("/api/system/old-data").set("Cookie", TEST_COOKIE).expect(200)).body as {
      apps: { appId: string; name: string }[];
      sets: { folder: string; appId: string }[];
      notice: boolean;
    };

  const tables = () =>
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%premove%' ORDER BY name")
        .all() as { name: string }[]
    ).map((r) => r.name);

  it("lists the apps with older data, and asks", async () => {
    expect(await status()).toEqual({ apps: [], sets: [], notice: false });
    setAside();
    const s = await status();
    expect(s.apps).toEqual([
      { appId: "todo", name: "Todo" },
      { appId: "bookmarks", name: "Bookmarks" },
    ]);
    expect(s.sets.map((x) => `${x.folder}/${x.appId}`)).toEqual([
      "2026-11-09/todo",
      "2026-11-09.1/todo",
      "2026-11-09/bookmarks",
    ]);
    expect(s.notice).toBe(true);
  });

  it("saves the .tar.gz as the user, in the apps’ own JSON, one folder per set", async () => {
    setAside();
    const res = await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "Documents/old.tar.gz" })
      .expect(201);
    expect(res.body).toEqual({ path: "Documents/old.tar.gz", files: 3 });

    const out = mkdtempSync(join(tmpdir(), "imb-old-data-x-"));
    try {
      const archive = join(home, "Documents", "old.tar.gz");
      const members = execFileSync("tar", ["-tzf", archive], {
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
      expect(members.every((m) => !m.startsWith("./"))).toBe(true);
      execFileSync("tar", ["-xzf", archive, "-C", out]);
      const read = (p: string) => JSON.parse(readFileSync(join(out, p), "utf8")) as unknown;

      expect(read("2026-11-09/todo/lists/3.json")).toEqual({
        id: 3,
        name: "Errands",
        position: 2,
        todos: [
          {
            id: 7,
            text: "Milk",
            completed: true,
            position: 4,
            dueAt: 1762700000000,
            priority: true,
            createdAt: "2026-11-01 10:00:00",
            updatedAt: "2026-11-02 11:00:00",
          },
        ],
      });
      // The second set that day has no lists: its task is unfiled.
      expect(read("2026-11-09.1/todo/unfiled.json")).toEqual({
        todos: [
          {
            id: 9,
            text: "Call home",
            completed: false,
            position: 1,
            dueAt: null,
            priority: false,
            createdAt: "2026-11-03 09:00:00",
            updatedAt: "2026-11-03 09:00:00",
          },
        ],
      });
      expect(read("2026-11-09/bookmarks/bookmarks.json")).toEqual({
        groups: [
          {
            id: 5,
            name: "News",
            icon: null,
            parentId: null,
            position: 6,
            links: [
              {
                id: 11,
                title: "Paper",
                url: "https://example.com/",
                icon: null,
                position: 8,
              },
            ],
          },
        ],
      });
      // Private, as the move writes them.
      expect(statSync(join(out, "2026-11-09/todo/lists/3.json")).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }

    // A download is the owner's pick: the notice stops, the data stays.
    const after = await status();
    expect(after.notice).toBe(false);
    expect(after.sets).toHaveLength(3);
    expect(tables()).toHaveLength(6);
  });

  it("a table set aside after the download asks again", async () => {
    setAside();
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "old.tar.gz" })
      .expect(201);
    db.exec(
      "CREATE TABLE git_recent_repos_premove_20261110 (id INTEGER PRIMARY KEY, root TEXT, path TEXT, app_id TEXT, last_opened TEXT)",
    );
    expect((await status()).notice).toBe(true);
  });

  it("cleans out exactly the set-aside tables", async () => {
    setAside();
    const res = await http.delete("/api/system/old-data").set("Cookie", TEST_COOKIE).expect(200);
    expect((res.body as { dropped: string[] }).dropped.sort()).toEqual([
      "bookmark_groups_premove_20261109",
      "bookmark_links_premove_20261109",
      "todo_lists_premove_20261109",
      "todos_premove_20261109",
      "todos_premove_20261109_2",
    ]);
    expect(tables()).toEqual(["notes_premove_20261109"]);
    expect(await status()).toEqual({ apps: [], sets: [], notice: false });
  });

  it("has nothing to download when nothing is set aside", async () => {
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "old.tar.gz" })
      .expect(404);
  });

  it("stays in the home", async () => {
    setAside();
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "../outside.tar.gz" })
      .expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    expect((await status()).notice).toBe(true);
  });

  it("refuses an app token on every route", async () => {
    setAside();
    const token = await appToken();
    // Built one at a time: supertest listens when a request is made.
    const calls = [
      () => http.get("/api/system/old-data"),
      () => http.post("/api/system/old-data/download").send({ root: "home", path: "old.tar.gz" }),
      () => http.delete("/api/system/old-data"),
    ];
    for (const call of calls) {
      const res = await call().set("Cookie", TEST_COOKIE).set(APP_TOKEN_HEADER, token).expect(403);
      expect((res.body as { code?: string }).code).toBe(USER_ONLY);
    }
    expect(tables()).toHaveLength(6);
  });

  const TODO_COLUMNS =
    "id INTEGER PRIMARY KEY, text TEXT, completed INTEGER, position INTEGER, due_at INTEGER, priority INTEGER, list_id INTEGER, created_at TEXT, updated_at TEXT";
  const staging = () => readdirSync(tmpdir()).filter((n) => /^imb-old-data-[A-Za-z0-9]{6}$/.test(n));

  it("pairs a move\u2019s tables set aside under different numbers on one day", async () => {
    db.exec(`
      CREATE TABLE todos_premove_20261109 (${TODO_COLUMNS});
      CREATE TABLE todo_lists_premove_20261109_2 (
        id INTEGER PRIMARY KEY, name TEXT, position INTEGER);
      INSERT INTO todo_lists_premove_20261109_2 VALUES (3, 'Errands', 2);
      INSERT INTO todos_premove_20261109 VALUES
        (7, 'Milk', 0, 1, NULL, 0, 3, '2026-11-01 10:00:00', '2026-11-01 10:00:00');
    `);
    const s = await status();
    expect(s.sets.map((x) => `${x.folder}/${x.appId}`)).toEqual(["2026-11-09/todo"]);
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "old.tar.gz" })
      .expect(201);
    const out = mkdtempSync(join(tmpdir(), "imb-old-data-x-"));
    try {
      execFileSync("tar", ["-xzf", join(home, "old.tar.gz"), "-C", out]);
      expect(existsSync(join(out, "2026-11-09/todo/lists/3.json"))).toBe(true);
      expect(existsSync(join(out, "README.txt"))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("says in the archive that sets apart on one day may be partial", async () => {
    setAside();
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "old.tar.gz" })
      .expect(201);
    const members = execFileSync("tar", ["-tzf", join(home, "old.tar.gz")], {
      encoding: "utf8",
    });
    expect(members).toContain("README.txt");
  });

  it("keeps a Git GUI repository whose folder is gone in the archive", async () => {
    mkdirSync(join(home, "here"));
    db.exec(`
      CREATE TABLE git_recent_repos_premove_20261109 (
        id INTEGER PRIMARY KEY, root TEXT, path TEXT, app_id TEXT, last_opened TEXT);
      INSERT INTO git_recent_repos_premove_20261109 VALUES
        (1, 'home', 'here', 'git-gui', '2026-11-02 10:00:00'),
        (2, 'home', 'gone', 'git-gui', '2026-11-01 10:00:00');
    `);
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "old.tar.gz" })
      .expect(201);
    const out = mkdtempSync(join(tmpdir(), "imb-old-data-x-"));
    try {
      execFileSync("tar", ["-xzf", join(home, "old.tar.gz"), "-C", out]);
      const doc = JSON.parse(readFileSync(join(out, "2026-11-09/git-gui/recents.json"), "utf8")) as {
        repos: { path: string }[];
      };
      expect(doc.repos.map((r) => r.path)).toEqual(["here", "gone"]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("removes its staging folder when the upload fails", async () => {
    setAside();
    const before = staging();
    const files = app.get(FilesService);
    const spy = jest.spyOn(files, "uploadFile").mockRejectedValueOnce(new Error("disk full"));
    await http
      .post("/api/system/old-data/download")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "old.tar.gz" })
      .expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    spy.mockRestore();
    expect(staging()).toEqual(before);
    expect((await status()).notice).toBe(true);
  });

  it("queues a download and a clean-out: the download sees the data, then it goes", async () => {
    setAside();
    const service = app.get(SetAsideService);
    const [saved, cleaned] = await Promise.all([service.download("home", "old.tar.gz"), service.cleanOut()]);
    expect(saved.files).toBe(3);
    expect(cleaned.dropped).toHaveLength(5);
    expect(existsSync(join(home, "old.tar.gz"))).toBe(true);
    expect(tables()).toEqual(["notes_premove_20261109"]);
  });
});
