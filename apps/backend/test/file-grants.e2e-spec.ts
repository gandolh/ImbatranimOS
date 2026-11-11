// In-memory DB and a scratch home so this e2e never touches real data.
process.env.DB_PATH = ":memory:";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomBytes, randomUUID } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import type { Server } from "http";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";

import { ConfigModule } from "../src/config/config.module";
import { DbModule } from "../src/db/db.module";
import { DbService } from "../src/db/db.service";
import { RecentService } from "../src/modules/files/recent.service";
import { AppIdentityModule } from "../src/modules/app-identity/app-identity.module";
import { APP_TOKEN_HEADER } from "../src/modules/app-identity/app-identity.types";
import { USER_ONLY } from "../src/modules/app-identity/calling-app";
import { ModeStore } from "../src/modules/app-identity/mode-store.service";
import { FILE_NOT_GRANTED } from "../src/modules/files/file-access";
import { FilesModule } from "../src/modules/files/files.module";
import { IdentityTestModule, TEST_COOKIE } from "../src/modules/identity/testing";

const mint = () => randomBytes(32).toString("hex");
const codeOf = (res: request.Response) => (res.body as { code?: string }).code;
const messageOf = (res: request.Response) => (res.body as { message?: string }).message ?? "";

describe("Files by grant (e2e)", () => {
  let app: INestApplication<Server>;
  let http: ReturnType<typeof request>;
  let home: string;
  const prevRoot = process.env.FILES_ROOT;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "imb-grants-e2e-"));
    process.env.FILES_ROOT = home;
    mkdirSync(join(home, "Documents/sub"), { recursive: true });
    writeFileSync(join(home, "Documents/plan.txt"), "the plan");
    writeFileSync(join(home, "Documents/other.txt"), "not given");
    writeFileSync(join(home, "Documents/sub/deep.txt"), "deep");

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, DbModule, IdentityTestModule, AppIdentityModule, FilesModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());

    // Hollow and Quill are installed apps; anything else is a built-in.
    const insert = app.get(DbService).db.prepare(
      `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, installed_at)
         VALUES (?, 'abc', 'b1', '/x', ?, 1)`,
    );
    insert.run("hollow", "dist/hollow.js");
    insert.run("quill", "dist/quill.js");
  });

  afterEach(async () => {
    await app.close();
    process.env.FILES_ROOT = prevRoot;
    rmSync(home, { recursive: true, force: true });
  });

  type Copy = { appId: string; instanceId: string; token: string };

  /** Register a token for a window of `appId`, as core does on its first call. */
  async function open(appId: string, instanceId: string = randomUUID()): Promise<Copy> {
    const token = mint();
    await http
      .post("/api/system/app-tokens")
      .set("Cookie", TEST_COOKIE)
      .send({ token, appId, instanceId, windowId: instanceId })
      .expect(201);
    return { appId, instanceId, token };
  }

  /** The OS gives a window a path (an open, or a pick), as core does: as the user. */
  const give = (to: Copy, path: string, expect?: "file" | "folder", via?: Copy) => {
    const req = http
      .post("/api/files/grants")
      .set("Cookie", TEST_COOKIE)
      .send({
        instanceId: to.instanceId,
        appId: to.appId,
        root: "home",
        path,
        ...(expect ? { expect } : {}),
      });
    return via ? req.set(APP_TOKEN_HEADER, via.token) : req;
  };

  const as = (who: Copy | null) => {
    const sign = (req: request.Test) => {
      req.set("Cookie", TEST_COOKIE);
      return who ? req.set(APP_TOKEN_HEADER, who.token) : req;
    };
    return {
      read: (path: string) => sign(http.get("/api/files/content").query({ root: "home", path })),
      download: (path: string) => sign(http.get("/api/files/download").query({ root: "home", path })),
      list: (path: string) => sign(http.get("/api/files").query({ root: "home", path })),
      stat: (path: string) => sign(http.get("/api/files/stat").query({ root: "home", path })),
      write: (path: string, content: string) =>
        sign(http.put("/api/files/content").send({ root: "home", path, content })),
      upload: (path: string, bytes: string) =>
        sign(
          http
            .post("/api/files/upload")
            .field("root", "home")
            .field("path", path)
            .attach("file", Buffer.from(bytes), "blob"),
        ),
      mkdir: (path: string) => sign(http.post("/api/files/directory").send({ root: "home", path })),
      remove: (path: string) => sign(http.delete("/api/files").query({ root: "home", path })),
      search: (query: string, path = "") =>
        sign(http.get("/api/files/search").query({ root: "home", query, path, content: "1" })),
    };
  };

  it("an app, installed or built in, is refused what it was not given, by name", async () => {
    const hollow = await open("hollow");
    const quill = await open("quill");
    const notepad = await open("notepad");
    for (const who of [hollow, quill, notepad]) {
      const res = await as(who).read("Documents/plan.txt").expect(403);
      expect(codeOf(res)).toBe(FILE_NOT_GRANTED);
      expect(messageOf(res)).toContain("home:Documents/plan.txt");
      expect(messageOf(res)).not.toContain(home);
      await as(who).list("Documents").expect(403);
      await as(who).write("Documents/plan.txt", "x").expect(403);
      await as(who).upload("Documents/new.txt", "x").expect(403);
    }
    // The user, and Files acting as the user, reach everything.
    await as(null).read("Documents/plan.txt").expect(200);
    await as(null).list("Documents").expect(200);
  });

  it("a built-in reaches only what it is given: an opened file, a pick, its folder if it declares it", async () => {
    const notepad = await open("notepad");
    await http
      .post("/api/files/grants")
      .set("Cookie", TEST_COOKIE)
      .send({
        instanceId: notepad.instanceId,
        appId: "notepad",
        root: "home",
        path: "Documents/plan.txt",
        withFolder: true,
      })
      .expect(204);
    await as(notepad).write("Documents/plan.txt", "saved").expect(200);
    await as(notepad).read("Documents/other.txt").expect(200);
    await as(notepad).list("Documents").expect(200);
    await as(notepad).read("Documents/sub/deep.txt").expect(403);
    await as(notepad).upload("Documents/new.txt", "x").expect(403);
    // A folder it may only list is no recent of its own.
    await http
      .post("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, notepad.token)
      .send({ root: "home", path: "Documents", appId: "notepad" })
      .expect(403);

    // The Code Editor with a picked folder: the folder and what is under it.
    const editor = await open("code-editor");
    await as(editor).list("Documents").expect(403);
    await give(editor, "Documents/sub", "folder").expect(204);
    await as(editor).list("Documents/sub").expect(200);
    await as(editor).upload("Documents/sub/new.txt", "x").expect(201);
    await as(editor).read("Documents/plan.txt").expect(403);

    // A second window of the same built-in holds nothing.
    const again = await open("notepad");
    await as(again).read("Documents/plan.txt").expect(403);

    // A link followed to a file beside the document: handed on to read only.
    await give(again, "Documents/other.txt", undefined, notepad).expect(204);
    await as(again).read("Documents/other.txt").expect(200);
    await as(again).write("Documents/other.txt", "no").expect(403);
    // The document itself, which it may save, goes on whole.
    await give(again, "Documents/plan.txt", undefined, notepad).expect(204);
    await as(again).write("Documents/plan.txt", "saved again").expect(200);
    // Nothing below the folder, and nothing new.
    await give(again, "Documents/sub/deep.txt", undefined, notepad).expect(403);
    await give(again, "Documents/fresh.txt", undefined, notepad).expect(403);
  });

  it("an app opening itself with a file it may only read gives the new window read only, recent or not", async () => {
    // Notepad opened plan.txt from Files: the file, and its folder to read.
    const first = await open("notepad");
    await http
      .post("/api/files/grants")
      .set("Cookie", TEST_COOKIE)
      .send({
        instanceId: first.instanceId,
        appId: "notepad",
        root: "home",
        path: "Documents/plan.txt",
        withFolder: true,
      })
      .expect(204);
    // A link in it to other.txt: core records the open as Notepad's recent
    // (with its token), then hands the file to the new window.
    await http
      .post("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, first.token)
      .send({ root: "home", path: "Documents/other.txt", appId: "notepad" })
      .expect(204);
    const second = await open("notepad");
    await give(second, "Documents/other.txt", undefined, first).expect(204);
    const kinds = app
      .get(DbService)
      .db.prepare(`SELECT kind FROM file_grants WHERE instance_id = ? AND path LIKE '%/other.txt'`)
      .all(second.instanceId);
    expect(kinds).toEqual([{ kind: "read" }]);
    await as(second).read("Documents/other.txt").expect(200);
    await as(second).write("Documents/other.txt", "laundered").expect(403);

    // A later window that holds nothing reopens that recent read only too.
    const third = await open("notepad");
    await give(third, "Documents/other.txt", undefined, third).expect(204);
    await as(third).write("Documents/other.txt", "laundered").expect(403);
    await as(third).read("Documents/other.txt").expect(200);
    expect(readFileSync(join(home, "Documents/other.txt"), "utf8")).toBe("not given");

    // Opened through the OS, it is the user's to give whole: the recent says so.
    await http
      .post("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "Documents/other.txt", appId: "notepad" })
      .expect(204);
    const fourth = await open("notepad");
    await give(fourth, "Documents/other.txt", undefined, fourth).expect(204);
    await as(fourth).write("Documents/other.txt", "saved").expect(200);
  });

  it("a window may read and save the file it was opened with, and nothing beside it", async () => {
    const docs = await open("hollow");
    await give(docs, "Documents/plan.txt").expect(204);

    const read = await as(docs).read("Documents/plan.txt").expect(200);
    expect((read.body as { content: string }).content).toBe("the plan");
    await as(docs).download("Documents/plan.txt").expect(200);
    await as(docs).write("Documents/plan.txt", "edited").expect(200);
    await as(docs).upload("Documents/plan.txt", "saved").expect(201);
    expect(readFileSync(join(home, "Documents/plan.txt"), "utf8")).toBe("saved");
    const stat = await as(docs).stat("Documents/plan.txt").expect(200);
    expect((stat.body as { size: number }).size).toBe(5);

    await as(docs).read("Documents/other.txt").expect(403);
    await as(docs).list("Documents").expect(403);
    await as(docs).remove("Documents/plan.txt").expect(403);
  });

  it("Save as writes the picked path, which stays the user’s", async () => {
    const docs = await open("hollow");
    await give(docs, "Documents/new folder/report.txt", "file").expect(204);
    await as(docs).upload("Documents/new folder/report.txt", "hi").expect(201);
    expect(readFileSync(join(home, "Documents/new folder/report.txt"), "utf8")).toBe("hi");
    expect(app.get(ModeStore).stat(join(home, "Documents/new folder/report.txt"))).toBeNull();
    await as(docs).upload("Documents/new folder/other.txt", "no").expect(403);
  });

  it("a picked folder gives what is under it, but not the folder itself", async () => {
    const player = await open("hollow");
    await give(player, "Documents", "folder").expect(204);

    const listed = await as(player).list("Documents").expect(200);
    expect((listed.body as { name: string }[]).map((e) => e.name).sort()).toEqual(["other.txt", "plan.txt", "sub"]);
    await as(player).read("Documents/sub/deep.txt").expect(200);
    await as(player).mkdir("Documents/sub/more").expect(201);
    await as(player).write("Documents/sub/more/a.txt", "a").expect(200);
    await as(player).remove("Documents/sub/more").expect(204);
    await as(player).remove("Documents").expect(403);
    await as(player).list("").expect(403);

    const found = await as(player).search("deep", "Documents").expect(200);
    expect((found.body as { items: { path: string }[] }).items.map((i) => i.path)).toEqual(["Documents/sub/deep.txt"]);
    await as(player).search("deep").expect(403);
  });

  it("a picked folder stops at another app’s own folder", async () => {
    const editor = await open("code-editor");
    const owned = join(home, "Documents/sub");
    app.get(ModeStore).set(owned, {
      owner: "hollow",
      group: "hollow",
      mode: 0o700,
    });
    await give(editor, "Documents", "folder").expect(204);
    await as(editor).list("Documents").expect(200);
    await as(editor).list("Documents/sub").expect(403);
    await as(editor).read("Documents/sub/deep.txt").expect(403);
    const found = await as(editor).search("deep", "Documents").expect(200);
    expect((found.body as { items: unknown[] }).items).toEqual([]);
  });

  it("a second window of the same app holds nothing until it is given something", async () => {
    const first = await open("hollow");
    const second = await open("hollow");
    await give(first, "Documents/plan.txt").expect(204);
    await as(first).read("Documents/plan.txt").expect(200);
    await as(second).read("Documents/plan.txt").expect(403);
    await give(second, "Documents/plan.txt").expect(204);
    await as(second).read("Documents/plan.txt").expect(200);
  });

  it("grants die with the window, and outlive a new token for the same window", async () => {
    const instanceId = randomUUID();
    const before = await open("hollow", instanceId);
    await give(before, "Documents/plan.txt").expect(204);

    // A backend restart ends every token; core mints the window a new one.
    const after = await open("hollow", instanceId);
    await as(after).read("Documents/plan.txt").expect(200);

    // Closing the window ends its token, and what it was given.
    await http
      .delete("/api/system/app-tokens/self")
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, after.token)
      .expect(204);
    const reopened = await open("hollow", instanceId);
    await as(reopened).read("Documents/plan.txt").expect(403);

    // Core drops them as the user too, for a window that never called.
    await give(reopened, "Documents/plan.txt").expect(204);
    await http.delete(`/api/files/grants/${instanceId}`).set("Cookie", TEST_COOKIE).expect(204);
    await as(reopened).read("Documents/plan.txt").expect(403);
  });

  it("an app hands on what it holds, and nothing more", async () => {
    const client = await open("hollow");
    const quill = await open("quill");

    // It holds nothing: handing on is refused, and gives nothing.
    await give(quill, "Documents/plan.txt", undefined, client).expect(403);
    await as(quill).read("Documents/plan.txt").expect(403);

    // Its own data file, by its modes.
    const own = join(home, ".local/share/imbatranim/hollow");
    mkdirSync(own, { recursive: true });
    writeFileSync(join(own, "collections.json"), "{}");
    const store = app.get(ModeStore);
    const asClient = {
      appId: "hollow",
      instanceId: client.instanceId,
      windowId: null,
      groups: ["hollow"],
    };
    store.create(asClient, own, "directory");
    store.create(asClient, join(own, "collections.json"), "file");
    const doc = ".local/share/imbatranim/hollow/collections.json";
    await as(quill).read(doc).expect(403);
    await give(quill, doc, undefined, client).expect(204);
    await as(quill).read(doc).expect(200);

    // A file given to it hands on as a file, never as its folder.
    await give(client, "Documents/plan.txt").expect(204);
    await give(quill, "Documents", "folder", client).expect(403);
    await give(quill, "Documents/plan.txt", undefined, client).expect(204);
    await as(quill).read("Documents/plan.txt").expect(200);

    // An app ends no window's grants.
    const ended = await http
      .delete(`/api/files/grants/${quill.instanceId}`)
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, client.token)
      .expect(403);
    expect(codeOf(ended)).toBe(USER_ONLY);
  });

  it("an OS-made open can give the file’s folder to read: the folder and the files directly in it", async () => {
    const viewer = await open("hollow");
    const withFolder = (to: Copy, path: string, via?: Copy) => {
      const req = http.post("/api/files/grants").set("Cookie", TEST_COOKIE).send({
        instanceId: to.instanceId,
        appId: to.appId,
        root: "home",
        path,
        withFolder: true,
      });
      return via ? req.set(APP_TOKEN_HEADER, via.token) : req;
    };
    await withFolder(viewer, "Documents/plan.txt").expect(204);
    await as(viewer).list("Documents").expect(200);
    await as(viewer).read("Documents/other.txt").expect(200);
    await as(viewer).write("Documents/plan.txt", "saved").expect(200);
    // Read only, and not below.
    await as(viewer).write("Documents/other.txt", "no").expect(403);
    await as(viewer).upload("Documents/new.txt", "no").expect(403);
    await as(viewer).list("Documents/sub").expect(403);
    await as(viewer).read("Documents/sub/deep.txt").expect(403);
    await as(viewer).list("").expect(403);

    // Only the OS gives a folder: an app's own open never does.
    const other = await open("hollow");
    await withFolder(other, "Documents/plan.txt", viewer).expect(403);
    await as(other).list("Documents").expect(403);
    // A folder has no folder to come with; a Save as into a new folder gives none.
    await withFolder(viewer, "Documents/sub").expect(400);
    const saver = await open("quill");
    await withFolder(saver, "Fresh/new.txt").expect(204);
    await as(saver).list("Fresh").expect(403);
  });

  describe("an OS-made open can let the app add to an assets folder beside the file", () => {
    const withAssets = (to: Copy, path: string, via?: Copy) => {
      const req = http.post("/api/files/grants").set("Cookie", TEST_COOKIE).send({
        instanceId: to.instanceId,
        appId: to.appId,
        root: "home",
        path,
        withFolder: true,
        withAssets: true,
      });
      return via ? req.set(APP_TOKEN_HEADER, via.token) : req;
    };
    const signed = (who: Copy, req: request.Test) => req.set("Cookie", TEST_COOKIE).set(APP_TOKEN_HEADER, who.token);

    it("makes the folder with the first file, and lists and reads it", async () => {
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      await as(notepad).list("Documents/assets").expect(404);
      await as(notepad).upload("Documents/assets/shot.png", "png").expect(201);
      expect(readFileSync(join(home, "Documents/assets/shot.png"), "utf8")).toBe("png");
      const listed = await as(notepad).list("Documents/assets").expect(200);
      expect((listed.body as { name: string }[]).map((e) => e.name)).toEqual(["shot.png"]);
      await as(notepad).download("Documents/assets/shot.png").expect(200);
      await as(notepad).write("Documents/assets/notes.md", "text").expect(200);
      // An assets folder made by itself is fine too, once.
      const other = await open("notepad");
      await withAssets(other, "Documents/sub/deep.txt").expect(204);
      await as(other).mkdir("Documents/sub/assets").expect(201);
      await as(other).mkdir("Documents/sub/assets").expect(400);
    });

    it("never writes over, renames or removes what is there: a taken name is a 409", async () => {
      mkdirSync(join(home, "Documents/assets"));
      writeFileSync(join(home, "Documents/assets/shot.png"), "theirs");
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      const taken = await as(notepad).upload("Documents/assets/shot.png", "mine").expect(409);
      expect(codeOf(taken)).toBe("NAME_TAKEN");
      await as(notepad).write("Documents/assets/shot.png", "mine").expect(409);
      await as(notepad).remove("Documents/assets/shot.png").expect(403);
      await signed(
        notepad,
        http.post("/api/files/move").send({
          root: "home",
          from: "Documents/assets/shot.png",
          to: "Documents/assets/moved.png",
        }),
      ).expect(403);
      await as(notepad).remove("Documents/assets").expect(403);
      expect(readFileSync(join(home, "Documents/assets/shot.png"), "utf8")).toBe("theirs");
      // The next name is free.
      await as(notepad).upload("Documents/assets/shot-2.png", "mine").expect(201);
    });

    it("adds nothing beside the file, or below the assets folder", async () => {
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      await as(notepad).upload("Documents/shot.png", "x").expect(403);
      await as(notepad).write("Documents/other.txt", "x").expect(403);
      await as(notepad).mkdir("Documents/assets2").expect(403);
      await as(notepad).upload("Documents/assets/a/b.png", "x").expect(403);
      expect(existsSync(join(home, "Documents/shot.png"))).toBe(false);
      expect(existsSync(join(home, "Documents/assets/a"))).toBe(false);
    });

    it("a symlinked assets folder gives nothing, and a link inside it is never written through", async () => {
      mkdirSync(join(home, "Elsewhere"));
      symlinkSync(join(home, "Elsewhere"), join(home, "Documents/assets"));
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      await as(notepad).upload("Documents/assets/x.png", "x").expect(403);
      await as(notepad).list("Documents/assets").expect(403);
      expect(existsSync(join(home, "Elsewhere/x.png"))).toBe(false);

      // A real folder holding a dangling link: adding under the link's name
      // is refused rather than written through it.
      rmSync(join(home, "Documents/assets"));
      mkdirSync(join(home, "Documents/sub/assets"));
      symlinkSync(join(home, "Elsewhere/target.png"), join(home, "Documents/sub/assets/dangling.png"));
      const other = await open("notepad");
      await withAssets(other, "Documents/sub/deep.txt").expect(204);
      await as(other).upload("Documents/sub/assets/dangling.png", "x").expect(409);
      expect(existsSync(join(home, "Elsewhere/target.png"))).toBe(false);
    });

    /** Notepad's own data folder, made by Notepad, holding a folder and a file. */
    function notepadData(notepad: Copy): void {
      const own = join(home, ".local/share/imbatranim/notepad");
      mkdirSync(join(own, "x"), { recursive: true });
      writeFileSync(join(own, "x/inner.txt"), "mine");
      writeFileSync(join(own, "one.png"), "png");
      const store = app.get(ModeStore);
      const me = {
        appId: "notepad",
        instanceId: notepad.instanceId,
        windowId: null,
        groups: ["notepad"],
      };
      store.create(me, own, "directory");
      store.create(me, join(own, "x"), "directory");
      store.create(me, join(own, "x/inner.txt"), "file");
      store.create(me, join(own, "one.png"), "file");
    }
    const moveAs = (who: Copy, from: string, to: string) =>
      signed(who, http.post("/api/files/move").send({ root: "home", from, to }));
    const copyAs = (who: Copy, from: string, to: string) =>
      signed(who, http.post("/api/files/copy").send({ root: "home", from, to }));

    it("nothing moves into it: the app would own what it moved", async () => {
      const notepad = await open("notepad");
      notepadData(notepad);
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      const data = ".local/share/imbatranim/notepad";
      // A folder of its own, as the assets folder or inside it.
      await moveAs(notepad, `${data}/x`, "Documents/assets").expect(403);
      mkdirSync(join(home, "Documents/assets"));
      await moveAs(notepad, `${data}/x`, "Documents/assets/x").expect(403);
      // A single file of its own, too.
      await moveAs(notepad, `${data}/one.png`, "Documents/assets/one.png").expect(403);
      expect(existsSync(join(home, "Documents/assets/x"))).toBe(false);
      expect(existsSync(join(home, "Documents/assets/one.png"))).toBe(false);
      expect(existsSync(join(home, data, "x/inner.txt"))).toBe(true);
    });

    it("a file is copied in as the user’s, a folder never", async () => {
      const notepad = await open("notepad");
      notepadData(notepad);
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      const data = ".local/share/imbatranim/notepad";
      await copyAs(notepad, `${data}/x`, "Documents/assets").expect(403);
      await copyAs(notepad, `${data}/x`, "Documents/assets/x").expect(403);
      await copyAs(notepad, `${data}/one.png`, "Documents/assets").expect(403);
      await copyAs(notepad, `${data}/one.png`, "Documents/assets/one.png").expect(201);
      expect(readFileSync(join(home, "Documents/assets/one.png"), "utf8")).toBe("png");
      expect(app.get(ModeStore).stat(join(home, "Documents/assets/one.png"))?.owner ?? null).toBeNull();
      // Copied in, it is still only added to: never written over or removed.
      await as(notepad).write("Documents/assets/one.png", "x").expect(409);
      await as(notepad).remove("Documents/assets/one.png").expect(403);
      await copyAs(notepad, `${data}/one.png`, "Documents/assets/one.png").expect(400);
    });

    it("never a file where the folder goes, nor a folder inside it", async () => {
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      await as(notepad).write("Documents/assets", "x").expect(403);
      await as(notepad).upload("Documents/assets", "x").expect(403);
      expect(existsSync(join(home, "Documents/assets"))).toBe(false);
      await as(notepad).mkdir("Documents/assets/sub").expect(403);
      expect(existsSync(join(home, "Documents/assets"))).toBe(false);
      await as(notepad).mkdir("Documents/assets").expect(201);
      await as(notepad).mkdir("Documents/assets/sub").expect(403);
      expect(existsSync(join(home, "Documents/assets/sub"))).toBe(false);
    });

    it("a path that climbs out with .. is held to where it lands", async () => {
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      await as(notepad).upload("Documents/assets/../shot.png", "x").expect(403);
      await as(notepad).upload("Documents/assets/../assets/shot.png", "x").expect(201);
      await as(notepad).upload("Documents/assets/../../x.png", "x").expect(403);
      expect(existsSync(join(home, "Documents/shot.png"))).toBe(false);
      expect(existsSync(join(home, "x.png"))).toBe(false);
    });

    it("is not given on another app’s folder", async () => {
      const hollow = {
        appId: "hollow",
        instanceId: "h1",
        windowId: null,
        groups: ["hollow"],
      };
      const theirs = join(home, ".local/share/imbatranim/hollow");
      mkdirSync(theirs, { recursive: true });
      writeFileSync(join(theirs, "doc.md"), "# theirs");
      app.get(ModeStore).create(hollow, theirs, "directory");
      const notepad = await open("notepad");
      await withAssets(notepad, ".local/share/imbatranim/hollow/doc.md").expect(204);
      await as(notepad).upload(".local/share/imbatranim/hollow/assets/x.png", "x").expect(403);
      expect(existsSync(join(theirs, "assets"))).toBe(false);
    });

    it("only the OS gives it", async () => {
      const notepad = await open("notepad");
      await withAssets(notepad, "Documents/plan.txt").expect(204);
      // Notepad handing a file on to another window gives no assets folder.
      const second = await open("notepad");
      const handed = await withAssets(second, "Documents/plan.txt", notepad).expect(403);
      expect(messageOf(handed)).toContain("only the OS");
      await give(second, "Documents/plan.txt", undefined, notepad).expect(204);
      await as(second).upload("Documents/assets/x.png", "x").expect(403);
      // Without the flag the open gives the folder to read, nothing to add.
      const viewer = await open("hollow");
      await http
        .post("/api/files/grants")
        .set("Cookie", TEST_COOKIE)
        .send({
          instanceId: viewer.instanceId,
          appId: viewer.appId,
          root: "home",
          path: "Documents/plan.txt",
          withFolder: true,
        })
        .expect(204);
      await as(viewer).upload("Documents/assets/x.png", "x").expect(403);
      await as(viewer).list("Documents/assets").expect(403);
      // A folder has no assets folder beside it.
      await withAssets(notepad, "Documents/sub").expect(400);
    });
  });

  it("an app can’t open itself with a file it doesn’t hold", async () => {
    const first = await open("hollow");
    const second = await open("hollow");
    // Opening its own window, or a new one, with a path: no grant either way.
    await give(first, "Documents/plan.txt", undefined, first).expect(403);
    await give(second, "Documents/plan.txt", undefined, first).expect(403);
    await as(first).read("Documents/plan.txt").expect(403);
    await as(second).read("Documents/plan.txt").expect(403);
  });

  it("an app reopens its own recent file in a new window, and another app can’t", async () => {
    const recordAs = (who: Copy | null, path: string, appId: string) => {
      const req = http.post("/api/files/recent").set("Cookie", TEST_COOKIE).send({ root: "home", path, appId });
      return who ? req.set(APP_TOKEN_HEADER, who.token) : req;
    };
    // Files opened plan.txt with Hollow, which recorded it as the user.
    await recordAs(null, "Documents/plan.txt", "hollow").expect(204);

    const first = await open("hollow");
    const second = await open("hollow");
    await give(second, "Documents/plan.txt", undefined, first).expect(204);
    await as(second).read("Documents/plan.txt").expect(200);
    await as(first).read("Documents/plan.txt").expect(403);
    // It records the reopen (moving it up) without holding the file itself.
    await recordAs(first, "Documents/plan.txt", "hollow").expect(204);
    // A folder it records only while it holds it whole, as a pick gives it.
    await recordAs(first, "Documents/sub", "hollow").expect(403);
    await give(second, "Documents/sub", "folder", first).expect(403);
    const picked = await open("hollow");
    await give(picked, "Documents/sub", "folder").expect(204);
    await recordAs(picked, "Documents/sub", "hollow").expect(204);
    // Then it is one of its recents, and reopens in a window of its own.
    await give(second, "Documents/sub", "folder", first).expect(204);
    await as(second).list("Documents/sub").expect(200);
    // The folder the OS opened with it is one of its recents too.
    await recordAs(null, "Documents", "hollow").expect(204);
    await give(second, "Documents", "folder", first).expect(204);
    await http
      .get("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .expect(200)
      .expect(({ body }: { body: { path: string; kind: string }[] }) => {
        expect(body.find((r) => r.path === "Documents/sub")?.kind).toBe("folder");
        expect(body.find((r) => r.path === "Documents/plan.txt")?.kind).toBe("file");
      });

    // What is there now must be what was recorded: a file recent where a
    // folder is now gives no folder, a folder recent where a file is now
    // gives no file.
    const db = app.get(DbService).db;
    db.prepare(`UPDATE recent_files SET kind = 'file' WHERE path = 'Documents/sub'`).run();
    db.prepare(
      `INSERT INTO recent_files (root, path, app_id, writable, kind)
       VALUES ('home', 'Documents/other.txt', 'hollow', 1, 'folder')`,
    ).run();
    const fresh = await open("hollow");
    await give(fresh, "Documents/sub", "folder", first).expect(403);
    await give(fresh, "Documents/other.txt", undefined, first).expect(403);

    // Another app can't use Hollow's recents, for itself or for Hollow.
    const quill = await open("quill");
    await give(quill, "Documents/sub", "folder", quill).expect(403);
    await give(quill, "Documents/plan.txt", undefined, quill).expect(403);
    await give(second, "Documents/plan.txt", undefined, quill).expect(403);
    await recordAs(quill, "Documents/plan.txt", "quill").expect(403);
    await as(quill).read("Documents/plan.txt").expect(403);
  });

  it("an uninstall that removes the data takes the app's recents, so nothing is handed back", async () => {
    const first = await open("hollow");
    const second = await open("hollow");
    // Hollow worked in a folder and opened a file: both its recents.
    await http
      .post("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "Documents/sub", appId: "hollow" })
      .expect(204);
    await http
      .post("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .send({ root: "home", path: "Documents/plan.txt", appId: "hollow" })
      .expect(204);
    await give(second, "Documents/sub", "folder", first).expect(204);

    // What the marketplace's uninstall does with "Also remove its data".
    app.get(RecentService).removeApps(["hollow"]);
    const third = await open("hollow");
    await give(third, "Documents/sub", "folder", first).expect(403);
    await give(third, "Documents/plan.txt", undefined, first).expect(403);
  });

  it("a grant matches what the dialog said it gave", async () => {
    const docs = await open("hollow");
    await give(docs, "Documents", "file").expect(400);
    await give(docs, "Documents/plan.txt", "folder").expect(400);
    await give(docs, "Documents/missing", "folder").expect(404);
    await give(docs, "../outside.txt").expect(400);
    await http
      .post("/api/files/grants")
      .set("Cookie", TEST_COOKIE)
      .send({
        instanceId: docs.instanceId,
        appId: "system",
        root: "home",
        path: "a",
      })
      .expect(400);
  });

  it("an app records, sees and drops only its own recent files, and only what it may read", async () => {
    const docs = await open("hollow");
    const record = (who: Copy | null, path: string, appId: string) => {
      const req = http.post("/api/files/recent").set("Cookie", TEST_COOKIE).send({ root: "home", path, appId });
      return who ? req.set(APP_TOKEN_HEADER, who.token) : req;
    };
    await record(docs, "Documents/plan.txt", "hollow").expect(403);
    await give(docs, "Documents/plan.txt").expect(204);
    await record(docs, "Documents/plan.txt", "notepad").expect(403);
    await record(docs, "Documents/plan.txt", "hollow").expect(204);
    await record(null, "Documents/other.txt", "notepad").expect(204);

    const mine = await http
      .get("/api/files/recent")
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(200);
    expect((mine.body as { path: string }[]).map((r) => r.path)).toEqual(["Documents/plan.txt"]);
    await http
      .delete("/api/files/recent")
      .query({ root: "home", path: "Documents/other.txt" })
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(204);
    await http.delete("/api/files/recent/all").set("Cookie", TEST_COOKIE).set(APP_TOKEN_HEADER, docs.token).expect(403);
    const all = await http.get("/api/files/recent").set("Cookie", TEST_COOKIE).expect(200);
    expect((all.body as unknown[]).length).toBe(2);
  });

  it("the Trash is the user’s alone", async () => {
    const docs = await open("hollow");
    const res = await http
      .get("/api/files/trash")
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(403);
    expect(codeOf(res)).toBe(USER_ONLY);
    await http.get("/api/files/trash").set("Cookie", TEST_COOKIE).expect(200);

    // Trashing is deleting: a picked folder's child may go, the rest may not.
    await give(docs, "Documents/sub", "folder").expect(204);
    await http
      .delete("/api/files")
      .query({ root: "home", path: "Documents/plan.txt", trash: "1" })
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(403);
    await http
      .delete("/api/files")
      .query({ root: "home", path: "Documents/sub/deep.txt", trash: "1" })
      .set("Cookie", TEST_COOKIE)
      .set(APP_TOKEN_HEADER, docs.token)
      .expect(204);
    expect(existsSync(join(home, "Documents/sub/deep.txt"))).toBe(false);
  });

  it("an app’s own folder works through the files API by its modes, and what it makes there is its own", async () => {
    const docs = await open("hollow");
    const own = join(home, ".config/imbatranim/hollow");
    mkdirSync(own, { recursive: true });
    const store = app.get(ModeStore);
    store.create(
      {
        appId: "hollow",
        instanceId: docs.instanceId,
        windowId: null,
        groups: ["hollow"],
      },
      own,
      "directory",
    );
    await as(docs).write(".config/imbatranim/hollow/a/b.json", "{}").expect(200);
    expect(store.stat(join(own, "a"))?.owner).toBe("hollow");
    expect(store.stat(join(own, "a/b.json"))?.owner).toBe("hollow");
    await as(docs).read(".config/imbatranim/hollow/a/b.json").expect(200);
    await as(docs).list(".config/imbatranim").expect(403);
  });
});
