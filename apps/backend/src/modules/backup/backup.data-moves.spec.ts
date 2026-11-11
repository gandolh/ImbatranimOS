import * as fs from "fs/promises";
import * as os from "os";
import { join } from "path";
import { ConfigService } from "@nestjs/config";
import { FilesService } from "../files/files.service";
import { RecentService } from "../files/recent.service";
import { ArchiveService } from "../archive/archive.service";
import { DbService } from "../../db/db.service";
import { LogService } from "../logs/log.service";
import { makeLocalIdentity } from "../identity/testing";
import type { InstalledApps } from "../app-identity/installed-apps";
import { ModeStore } from "../app-identity/mode-store.service";
import { AppDataService } from "../app-data/app-data.service";
import { DataMovesService } from "../app-data/data-moves.service";
import { BackupService } from "./backup.service";

/**
 * A restore swaps the database and home in place, so it runs the data moves
 * itself: a backup holding the old tables must not wait for a restart.
 */
describe("BackupService — a restore runs the data moves", () => {
  let home: string;
  let outside: string;
  let db: DbService;
  let service: BackupService;
  let moves: DataMovesService;
  let runSpy: jest.SpyInstance;
  let logs: LogService;
  const prevRoot = process.env.FILES_ROOT;
  const dbPath = () => join(home, ".imbatranim", "db.sqlite");
  const todoFile = () => join(home, ".local", "share", "imbatranim", "todo", "unfiled.json");
  const bookmarksFile = () => join(home, ".local", "share", "imbatranim", "bookmarks", "bookmarks.json");

  beforeEach(async () => {
    home = await fs.mkdtemp(join(os.tmpdir(), "imb-bmoves-home-"));
    outside = await fs.mkdtemp(join(os.tmpdir(), "imb-bmoves-out-"));
    process.env.FILES_ROOT = home;
    await fs.mkdir(join(home, ".imbatranim"), { recursive: true });
    await fs.mkdir(join(home, "Documents"), { recursive: true });
    await fs.writeFile(join(home, "Documents", "letter.txt"), "dear world");

    const config = {
      get: (key: string) => (key === "DB_PATH" ? dbPath() : 24),
    } as unknown as ConfigService<never, true>;
    db = new DbService(config);
    db.onModuleInit();
    const files = new FilesService();
    logs = new LogService();
    await logs.onModuleInit();
    const installed = { isGone: () => true } as unknown as InstalledApps;
    const data = new AppDataService(new ModeStore(db), installed);
    moves = new DataMovesService(db, data, files, new RecentService(db), logs);
    runSpy = jest.spyOn(moves, "run");
    service = new BackupService(files, new ArchiveService(files), db, logs, makeLocalIdentity(db), moves);
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevRoot;
    try {
      db.db.close();
    } catch {
      /* already closed */
    }
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  const hasTable = (name: string) =>
    db.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;

  const takeBackup = async (): Promise<string> => {
    const stream = await service.openBackupStream();
    const chunks: Buffer[] = [];
    stream.stream.on("data", (c: Buffer) => chunks.push(c));
    await stream.done;
    await stream.dispose();
    const dest = join(outside, "backup.tar.gz");
    await fs.writeFile(dest, Buffer.concat(chunks));
    return dest;
  };

  const seed = () =>
    db.db.exec(`
      INSERT INTO todos (id, text) VALUES (1, 'restored todo');
      INSERT INTO bookmark_groups (id, name, position) VALUES (1, 'Work', 1);
      INSERT INTO bookmark_links (id, group_id, title, url, position)
        VALUES (1, 1, 'Tracker', 'https://tracker.example', 1);
    `);

  it("writes the apps files from the restored tables and drops them, with no restart", async () => {
    seed();
    const tarball = await takeBackup();
    // The live database goes on to lose its tables; the restore brings them back.
    db.db.exec("DROP TABLE todos; DROP TABLE bookmark_links; DROP TABLE bookmark_groups;");
    await expect(fs.stat(todoFile())).rejects.toBeDefined();

    const preview = await service.inspect(tarball);
    await service.apply(preview.id);

    const todos = JSON.parse(await fs.readFile(todoFile(), "utf8")) as {
      todos: { text: string }[];
    };
    expect(todos.todos.map((t) => t.text)).toEqual(["restored todo"]);
    const marks = await fs.readFile(bookmarksFile(), "utf8");
    expect(marks).toContain("Tracker");
    expect(hasTable("todos")).toBe(false);
    expect(hasTable("bookmark_links")).toBe(false);
  });

  it("runs no move when the swap fails and rolls back", async () => {
    seed();
    const tarball = await takeBackup();
    jest.spyOn(db, "replaceWith").mockImplementationOnce(() => {
      throw new Error("injected: the snapshot would not open");
    });

    const preview = await service.inspect(tarball);
    await expect(service.apply(preview.id)).rejects.toThrow("injected");

    expect(runSpy).not.toHaveBeenCalled();
    expect(hasTable("todos")).toBe(true);
    await expect(fs.stat(todoFile())).rejects.toBeDefined();
  });

  it("leaves everything as it was when the backup has no old tables", async () => {
    // A backup made after the move: the tables are already gone from it.
    db.db.exec("DROP TABLE todos; DROP TABLE bookmark_links; DROP TABLE bookmark_groups;");
    const tarball = await takeBackup();
    await fs.writeFile(join(home, "Documents", "letter.txt"), "edited since");

    const preview = await service.inspect(tarball);
    await service.apply(preview.id);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(hasTable("todos")).toBe(false);
    await expect(fs.stat(todoFile())).rejects.toBeDefined();
    await expect(fs.stat(bookmarksFile())).rejects.toBeDefined();
    expect(await fs.readFile(join(home, "Documents", "letter.txt"), "utf8")).toBe("dear world");
  });

  it("sets the restored tables aside when the app already holds a file of its own, and loses nothing", async () => {
    seed();
    const tarball = await takeBackup();
    // The live app files differ from anything the tables hold; the backup has no `.local`.
    await fs.mkdir(join(todoFile(), ".."), { recursive: true });
    await fs.writeFile(todoFile(), '{"todos":[]}\n');
    const record = jest.spyOn(logs, "record");

    const preview = await service.inspect(tarball);
    await service.apply(preview.id);

    expect(await fs.readFile(todoFile(), "utf8")).toBe('{"todos":[]}\n');
    expect(hasTable("todos")).toBe(false);
    const aside = (
      db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'todos_premove_%'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(aside).toHaveLength(1);
    expect(db.db.prepare(`SELECT text FROM ${aside[0]}`).all()).toEqual([{ text: "restored todo" }]);
    expect(record).toHaveBeenCalledWith("warn", "app-data.move.set-aside", expect.any(String), expect.anything());
  });

  it("reports a successful restore even when the moves throw", async () => {
    seed();
    const tarball = await takeBackup();
    runSpy.mockRejectedValueOnce(new Error("boom"));
    const preview = await service.inspect(tarball);
    await expect(service.apply(preview.id)).resolves.toBeDefined();
  });
});
