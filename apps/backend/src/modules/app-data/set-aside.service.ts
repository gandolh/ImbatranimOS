import { Injectable, NotFoundException, Optional } from "@nestjs/common";

import { execFile } from "child_process";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { promisify } from "util";

import { DbService } from "../../db/db.service";
import { FilesService } from "../files/files.service";
import { LogService } from "../logs/log.service";
import { DataMovesService } from "./data-moves.service";

const execFileAsync = promisify(execFile);

/** Wall-clock cap on packing the archive: a few small JSON files. */
const TAR_TIMEOUT_MS = 60_000;

/**
 * A table the data moves set aside: a moved table's name, `_premove_`, the
 * day, and a number from 2 when that name was taken. Only names matching this
 * are ever read or dropped, and only names found in `sqlite_master`.
 */
export const SET_ASIDE_TABLE =
  /^(todos|todo_lists|bookmark_links|bookmark_groups|git_recent_repos)_premove_(\d{8})(?:_(\d+))?$/;

const README_FILE = "README.txt";
const PARTIAL_NOTE = `Some apps have more than one folder for the same day. Their tables were set
aside apart, so each folder holds only the tables that were set aside with it:
a todo can sit in unfiled.json while the list it belonged to is in another
folder. Look in the sibling folders (2026-11-09.1 beside 2026-11-09).
`;

/** Which set-aside tables the owner has downloaded, beside the system log. */
const DOWNLOADED_FILE = join(".imbatranim", "set-aside-downloads.json");

/**
 * One set: the tables one move set aside together, found by their day and
 * number. Numbers that differ still pair when each table appears once that
 * day; when a table appears twice, the numbers keep the sets apart rather
 * than guess, so such a set can be partial (its todos without their lists).
 */
export type SetAsideSet = {
  /** Its folder in the archive: the ISO day, then `.1`, `.2` for later sets that day. */
  folder: string;
  appId: string;
  /** The live table's name → the set-aside table's. */
  tables: Record<string, string>;
};

export type SetAsideStatus = {
  /** The apps with older data, in the order the moves run. */
  apps: { appId: string; name: string }[];
  sets: SetAsideSet[];
  /** Whether the sign-in notice asks: a set-aside table not downloaded yet. */
  notice: boolean;
};

/**
 * The older data the moves set aside, for the owner to take or drop: a
 * `.tar.gz` of the files each move would have written from it, laid out like
 * the data folders under one folder per set (`2026-11-09/todo/lists/3.json`),
 * or every set-aside table dropped. Until either, the desktop asks at sign-in.
 *
 * A download is the owner's pick too: it is recorded in the home's
 * `.imbatranim/`, which backups carry with the database, and the notice stops
 * asking about those tables. A table set aside later asks again.
 */
@Injectable()
export class SetAsideService {
  constructor(
    private readonly dbs: DbService,
    private readonly moves: DataMovesService,
    private readonly files: FilesService,
    @Optional() private readonly logs?: LogService,
  ) {}

  status(): Promise<SetAsideStatus> {
    return this.moves.queued(() => this.read());
  }

  /**
   * Write the archive as the user to `path` in `root`, through the file API's
   * own write (the jail, the atomic rename over a file the Save dialog agreed
   * to replace). 404 when nothing is set aside.
   */
  download(root: string, path: string): Promise<{ path: string; files: number }> {
    return this.moves.queued(async () => {
      const { apps, sets } = await this.read();
      if (sets.length === 0) {
        throw new NotFoundException("No older data is set aside");
      }
      const staging = await fs.mkdtemp(join(tmpdir(), "imb-old-data-"));
      try {
        let count = 0;
        const folders = new Set<string>();
        for (const set of sets) {
          const dir = join(staging, set.folder, set.appId);
          await fs.mkdir(dir, { recursive: true, mode: 0o700 });
          folders.add(set.folder);
          const planned = await this.moves.filesFrom(set.appId, (table) => set.tables[table] ?? null);
          for (const [rel, content] of planned) {
            const abs = join(dir, rel);
            await fs.mkdir(dirname(abs), { recursive: true, mode: 0o700 });
            // Private, as the move writes them into the app's folder.
            await fs.writeFile(abs, content, { mode: 0o600 });
            count++;
          }
        }
        // Several sets of one app on one day were set aside apart, so a
        // folder may hold only some of that move's tables (todos without
        // their lists): the archive says so.
        const notes: string[] = [];
        if (new Set(sets.map((s) => `${s.appId}/${s.folder.split(".")[0]}`)).size < sets.length) {
          await fs.writeFile(join(staging, README_FILE), PARTIAL_NOTE, {
            mode: 0o600,
          });
          notes.push(README_FILE);
        }
        const archive = join(staging, "old-data.tar.gz");
        // Named folders, not `.`: members carry no `./` prefix, and the
        // archive never lists itself.
        await execFileAsync("tar", ["-czf", archive, "-C", staging, ...[...folders].sort(), ...notes], {
          timeout: TAR_TIMEOUT_MS,
        });
        const entry = await this.files.uploadFile(root, path, archive);
        await this.markDownloaded(sets);
        this.record(
          "app-data.set-aside.downloaded",
          `The older data of ${names(apps)} was saved to ${entry.path} (${count} ${count === 1 ? "file" : "files"}). It stays set aside until it is cleaned out.`,
        );
        return { path: entry.path, files: count };
      } finally {
        await fs.rm(staging, { recursive: true, force: true });
      }
    });
  }

  /** Drop every set-aside table, in one transaction. */
  cleanOut(): Promise<{ dropped: string[] }> {
    return this.moves.queued(async () => {
      const { apps } = await this.read();
      const dropped = this.tables().map((t) => t.name);
      if (dropped.length === 0) return { dropped };
      this.dbs.db.transaction(() => {
        for (const table of dropped) {
          this.dbs.db.exec(`DROP TABLE "${table}"`);
        }
      })();
      await this.writeDownloaded([]);
      this.record(
        "app-data.set-aside.cleaned",
        `The older data of ${names(apps)} was cleaned out: ${dropped.join(", ")}.`,
      );
      return { dropped };
    });
  }

  private async read(): Promise<SetAsideStatus> {
    const found = this.tables();
    const sets: SetAsideSet[] = [];
    const apps: SetAsideStatus["apps"] = [];
    for (const move of this.moves.movedTables()) {
      // Grouped by day and number: one move's tables set aside together. When
      // the numbers differ on a day but each table appears once that day (one
      // was missing, or its name taken, when the other was set aside), they
      // are still one set: nothing is left to guess between.
      const perDay = new Map<string, Map<string, number>>();
      for (const t of found) {
        if (!move.tables.includes(t.base)) continue;
        const bases = perDay.get(t.day) ?? new Map<string, number>();
        bases.set(t.base, (bases.get(t.base) ?? 0) + 1);
        perDay.set(t.day, bases);
      }
      const byKey = new Map<string, { day: string; n: number; tables: Record<string, string> }>();
      for (const t of found) {
        if (!move.tables.includes(t.base)) continue;
        const once = [...(perDay.get(t.day)?.values() ?? [])].every((c) => c === 1);
        const key = once ? t.day : `${t.day}_${t.n}`;
        const group = byKey.get(key) ?? { day: t.day, n: t.n, tables: {} };
        group.n = Math.min(group.n, t.n);
        group.tables[t.base] = t.name;
        byKey.set(key, group);
      }
      if (byKey.size === 0) continue;
      apps.push({ appId: move.appId, name: move.name });
      const groups = [...byKey.values()].sort((a, b) => (a.day === b.day ? a.n - b.n : a.day < b.day ? -1 : 1));
      // The first set of a day is the day's folder; later ones are numbered
      // like logrotate's: 2026-11-09, 2026-11-09.1, 2026-11-09.2.
      const seen = new Map<string, number>();
      for (const g of groups) {
        const nth = seen.get(g.day) ?? 0;
        seen.set(g.day, nth + 1);
        const iso = `${g.day.slice(0, 4)}-${g.day.slice(4, 6)}-${g.day.slice(6, 8)}`;
        sets.push({
          folder: nth === 0 ? iso : `${iso}.${nth}`,
          appId: move.appId,
          tables: g.tables,
        });
      }
    }
    const downloaded = await this.readDownloaded();
    return {
      apps,
      sets,
      notice: found.some((t) => !downloaded.has(t.name)),
    };
  }

  /** The set-aside tables in the database now, parsed. */
  private tables(): { name: string; base: string; day: string; n: number }[] {
    if (this.dbs.migrationFailure || !this.dbs.db?.open) return [];
    const rows = this.dbs.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const out: { name: string; base: string; day: string; n: number }[] = [];
    for (const { name } of rows) {
      const m = SET_ASIDE_TABLE.exec(name);
      if (!m) continue;
      out.push({ name, base: m[1], day: m[2], n: m[3] ? Number(m[3]) : 1 });
    }
    return out;
  }

  private async downloadedPath(): Promise<string> {
    const { rootDir } = await this.files.resolveSafe("home", "");
    return join(rootDir, DOWNLOADED_FILE);
  }

  private async readDownloaded(): Promise<Set<string>> {
    try {
      const raw = await fs.readFile(await this.downloadedPath(), "utf8");
      const doc = JSON.parse(raw) as { tables?: unknown };
      return new Set(Array.isArray(doc.tables) ? doc.tables.filter((t): t is string => typeof t === "string") : []);
    } catch {
      return new Set();
    }
  }

  private async markDownloaded(sets: readonly SetAsideSet[]): Promise<void> {
    const tables = new Set(await this.readDownloaded());
    for (const set of sets) {
      for (const name of Object.values(set.tables)) tables.add(name);
    }
    await this.writeDownloaded([...tables].sort());
  }

  private async writeDownloaded(tables: readonly string[]): Promise<void> {
    const abs = await this.downloadedPath();
    if (tables.length === 0) {
      await fs.rm(abs, { force: true });
      return;
    }
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, `${JSON.stringify({ tables }, null, 2)}\n`);
  }

  private record(event: string, message: string): void {
    try {
      this.logs?.record("info", event, message);
    } catch {
      // The log table is the casualty; the download or the drop is done.
    }
  }
}

/** "Todo", "Todo and Bookmarks", "Todo, Bookmarks and Git GUI". */
export function names(apps: readonly { name: string }[]): string {
  const all = apps.map((a) => a.name);
  if (all.length <= 1) return all.join("");
  return `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`;
}
