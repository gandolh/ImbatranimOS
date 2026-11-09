import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';

import * as fs from 'fs/promises';
import { join } from 'path';

import { DbService } from '../../db/db.service';
import { FilesService } from '../files/files.service';
import {
  MAX_FOLDER_RECENTS_PER_APP,
  RecentService,
} from '../files/recent.service';
import { LogService } from '../logs/log.service';
import type { AppIdentity } from '../app-identity/app-identity.types';
import { AppDataService } from './app-data.service';
import type { DataKind } from './app-data.paths';

/**
 * One-time moves of data the OS kept for an app in its own database into the
 * app's data folder, as JSON files the app reads through `system.data`. Run
 * at every start; a move whose tables are gone has nothing to do.
 *
 * Todo and Bookmarks were built in and kept their rows here. They install
 * now, as the Accessories group of imbatranim-apps, and their backend
 * modules are gone:
 *
 * - **Todo**: `lists/<id>.json` per list (its name, place and tasks) and
 *   `unfiled.json` for the tasks filed under none.
 * - **Bookmarks**: `bookmarks.json`, every folder flat with its `parentId`,
 *   each with its links.
 *
 * Git GUI, built in until it became the Developer group's, kept its recent
 * repositories in the `git` module's table; they move into its state folder
 * as `recents.json`, newest first, and each becomes one of its OS recents (a
 * folder), which is what lets it give a window of its own the repository
 * again. The `git` module keeps running git, with no list of its own.
 *
 * Ids, positions and timestamps are kept as they were, so the apps show the
 * same order, and a due-date toast already claimed is not claimed again.
 *
 * The files are written as the app, owned by it and private, whether or not
 * it is installed yet: they wait in its folder. Once every file is in place
 * the tables are dropped in one transaction. A write that fails keeps every
 * row, says so in Logs, and the move runs again at the next start; a file the
 * move already wrote is left as it is.
 *
 * A planned file the app has written since (the tables outlived an earlier
 * move, through a crash before the drop or a restored database) means the
 * app has taken over: the move writes nothing more, since that would bring
 * back what the owner changed or deleted, and sets the tables aside under
 * another name (`todos_premove_20261109`), kept and never read again. Logs
 * says so once.
 */

/** An app whose rows move, and the tables they leave. */
type Move = {
  appId: string;
  /** The app's install group, the descriptor that installs it. */
  group: string;
  name: string;
  tables: readonly string[];
  /** Which of the app's folders the files go in. */
  kind: DataKind;
  /** The files to write, by path in the app's folder, and what they hold. */
  files():
    | { files: Map<string, string>; summary: string }
    | Promise<{ files: Map<string, string>; summary: string }>;
  /** Rows the OS keeps itself, written in the transaction that drops the tables. */
  keep?(): void;
};

const json = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`;

type TodoRow = {
  id: number;
  text: string;
  completed: number;
  position: number;
  due_at: number | null;
  priority: number;
  list_id: number | null;
  created_at: string;
  updated_at: string;
};
type ListRow = { id: number; name: string; position: number };
type GroupRow = {
  id: number;
  name: string;
  icon: string | null;
  parent_id: number | null;
  position: number;
};
type RepoRow = { root: string; path: string; last_opened: string | null };
type LinkRow = {
  id: number;
  group_id: number;
  title: string;
  url: string;
  icon: string | null;
  position: number;
};

@Injectable()
export class DataMovesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DataMovesService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly data: AppDataService,
    private readonly fileRoots: FilesService,
    private readonly recent: RecentService,
    // Optional, as for DbService: a partial graph without LogsModule still boots.
    @Optional() private readonly logs?: LogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  /** The runs so far, chained: a start and restores never interleave. */
  private running: Promise<void> = Promise.resolve();

  /**
   * Every move still to do, one after the other. Never throws. Calls queue,
   * so a restore during another run, or two restores, wait their turn and see
   * what the earlier run left.
   */
  run(): Promise<void> {
    this.running = this.running.then(
      () => this.runOnce(),
      () => this.runOnce(),
    );
    return this.running;
  }

  private async runOnce(): Promise<void> {
    // A database that failed to open or migrate answers 503 everywhere; its
    // rows wait for a start that reads them.
    if (this.dbs.migrationFailure || !this.dbs.db?.open) return;
    for (const move of [
      this.todoMove(),
      this.bookmarksMove(),
      this.gitRecentsMove(),
    ]) {
      // A move that fails is state, like a failed migration, never a crash:
      // a throw here would stop the backend from starting.
      try {
        await this.runOne(move);
      } catch (err) {
        const message = `${move.name}'s data could not be moved into its folder, so it stays in the database and the move runs again at the next start: ${errorText(err)}`;
        this.logger.warn(message);
        this.record('warn', 'app-data.move.failed', message, move.appId);
      }
    }
  }

  private async runOne(move: Move): Promise<void> {
    const present = move.tables.filter((t) => this.hasTable(t));
    if (present.length === 0) return;
    const planned = await move.files();
    const identity: AppIdentity = {
      appId: move.appId,
      instanceId: `os-move-${move.appId}`,
      windowId: null,
      groups: [move.appId, move.group],
    };
    // Looked at before anything is written, so a move the app has taken
    // over brings back no file the owner deleted.
    for (const [path, content] of planned.files) {
      if (await this.differs(move.appId, move.kind, path, content)) {
        this.setAside(move, present, path);
        return;
      }
    }
    for (const [path, content] of planned.files) {
      try {
        await this.data.place(identity, move.kind, path, content);
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        this.setAside(move, present, path);
        return;
      }
    }
    // The files are in place; a drop that fails leaves the rows, and the
    // next start finds the same files and drops them then.
    this.dbs.db.transaction(() => {
      move.keep?.();
      for (const table of present) this.dbs.db.exec(`DROP TABLE ${table}`);
    })();
    const summary = planned.summary;
    if (summary) {
      this.record(
        'info',
        'app-data.move.done',
        `${move.name}'s data moved into its folder: ${summary}.`,
        move.appId,
      );
    }
  }

  /**
   * Whether the app's data folder holds `path` with other bytes than the
   * move's: anything there that isn't a plain file with these bytes. A
   * missing file doesn't differ; {@link AppDataService.place} checks the
   * rest when it writes.
   */
  private async differs(
    appId: string,
    kind: DataKind,
    path: string,
    content: string,
  ): Promise<boolean> {
    const abs = join(this.data.folder(appId, kind), path);
    const stat = await fs.lstat(abs).catch(() => null);
    if (!stat) return false;
    if (!stat.isFile()) return true;
    return !(await fs.readFile(abs)).equals(Buffer.from(content, 'utf8'));
  }

  /** Rename the tables out of the move's way, data kept, and say why once. */
  private setAside(move: Move, tables: readonly string[], path: string): void {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const names: string[] = [];
    this.dbs.db.transaction(() => {
      for (const table of tables) {
        let name = `${table}_premove_${day}`;
        for (let n = 2; this.hasTable(name); n++) {
          name = `${table}_premove_${day}_${n}`;
        }
        this.dbs.db.exec(`ALTER TABLE ${table} RENAME TO ${name}`);
        names.push(name);
      }
    })();
    const message = `${move.name} has written its own ${path} since its data was first moved, so the move stops there and writes nothing more. The old rows are kept, set aside as ${names.join(', ')}.`;
    this.logger.warn(message);
    this.record('warn', 'app-data.move.set-aside', message, move.appId);
  }

  private todoMove(): Move {
    return {
      appId: 'todo',
      group: 'accessories',
      name: 'Todo',
      tables: ['todos', 'todo_lists'],
      kind: 'data',
      files: () => {
        const todos = this.rows<TodoRow>(
          'todos',
          `SELECT id, text, completed, position, due_at, priority, list_id,
                  created_at, updated_at
             FROM todos ORDER BY position ASC, id ASC`,
        );
        const lists = this.rows<ListRow>(
          'todo_lists',
          'SELECT id, name, position FROM todo_lists ORDER BY position ASC, id ASC',
        );
        const files = new Map<string, string>();
        if (todos.length === 0 && lists.length === 0) {
          return { files, summary: '' };
        }
        const stored = (t: TodoRow) => ({
          id: t.id,
          text: t.text,
          completed: t.completed === 1,
          position: t.position,
          dueAt: t.due_at,
          priority: t.priority === 1,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        });
        const listIds = new Set(lists.map((l) => l.id));
        for (const list of lists) {
          files.set(
            `lists/${list.id}.json`,
            json({
              id: list.id,
              name: list.name,
              position: list.position,
              todos: todos.filter((t) => t.list_id === list.id).map(stored),
            }),
          );
        }
        // A task whose list is gone is unfiled, as the app shows it.
        const unfiled = todos.filter(
          (t) => t.list_id === null || !listIds.has(t.list_id),
        );
        if (unfiled.length > 0) {
          files.set('unfiled.json', json({ todos: unfiled.map(stored) }));
        }
        return {
          files,
          summary: `${count(todos.length, 'task')} in ${count(lists.length, 'list')}`,
        };
      },
    };
  }

  private bookmarksMove(): Move {
    return {
      appId: 'bookmarks',
      group: 'accessories',
      name: 'Bookmarks',
      tables: ['bookmark_links', 'bookmark_groups'],
      kind: 'data',
      files: () => {
        const groups = this.rows<GroupRow>(
          'bookmark_groups',
          'SELECT id, name, icon, parent_id, position FROM bookmark_groups ORDER BY position ASC, id ASC',
        );
        const links = this.rows<LinkRow>(
          'bookmark_links',
          'SELECT id, group_id, title, url, icon, position FROM bookmark_links ORDER BY position ASC, id ASC',
        );
        const files = new Map<string, string>();
        if (groups.length === 0) return { files, summary: '' };
        const kept = links.filter((l) =>
          groups.some((g) => g.id === l.group_id),
        );
        files.set(
          'bookmarks.json',
          json({
            groups: groups.map((g) => ({
              id: g.id,
              name: g.name,
              icon: g.icon,
              parentId: g.parent_id,
              position: g.position,
              links: kept
                .filter((l) => l.group_id === g.id)
                .map((l) => ({
                  id: l.id,
                  title: l.title,
                  url: l.url,
                  icon: l.icon,
                  position: l.position,
                })),
            })),
          }),
        );
        return {
          files,
          summary: `${count(kept.length, 'bookmark')} in ${count(groups.length, 'folder')}`,
        };
      },
    };
  }

  private gitRecentsMove(): Move {
    /** Git GUI's rows whose folder is still there, newest first, as many as it keeps. */
    let kept: RepoRow[] = [];
    return {
      appId: 'git-gui',
      group: 'developer',
      name: 'Git GUI',
      tables: ['git_recent_repos'],
      kind: 'state',
      files: async () => {
        // Only Git GUI's rows: a repository the user recorded had no app to
        // go to. A folder that is gone, or is no folder now, isn't moved.
        const rows = this.rows<RepoRow>(
          'git_recent_repos',
          `SELECT root, path, last_opened FROM git_recent_repos
            WHERE app_id = 'git-gui' ORDER BY last_opened DESC, id DESC`,
        );
        kept = [];
        for (const row of rows) {
          if (kept.length === MAX_FOLDER_RECENTS_PER_APP) break;
          if (await this.isFolder(row.root, row.path)) kept.push(row);
        }
        const files = new Map<string, string>();
        if (kept.length === 0) return { files, summary: '' };
        files.set(
          'recents.json',
          json({ repos: kept.map((r) => ({ root: r.root, path: r.path })) }),
        );
        return {
          files,
          summary: count(
            kept.length,
            'recent repository',
            'recent repositories',
          ),
        };
      },
      keep: () => {
        // Each its own recent, a folder it held, with the time it was last
        // opened: what lets Git GUI reopen it in a new window. A path already
        // among the recents keeps its row.
        const insert = this.dbs.db.prepare(
          `INSERT INTO recent_files (root, path, app_id, writable, kind, last_opened)
           VALUES (?, ?, 'git-gui', 1, 'folder', COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(root, path) DO NOTHING`,
        );
        for (const r of kept) insert.run(r.root, r.path, r.last_opened);
        this.recent.prune('git-gui');
      },
    };
  }

  /** Whether `(root, path)` names a folder in the home or the notes now. */
  private async isFolder(root: string, path: string): Promise<boolean> {
    return this.fileRoots
      .resolveSafe(root, path)
      .then(({ abs }) => fs.stat(abs))
      .then((s) => s.isDirectory())
      .catch(() => false);
  }

  private hasTable(name: string): boolean {
    return (
      this.dbs.db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(name) !== undefined
    );
  }

  /** A table's rows, or none when it is already gone. */
  private rows<T>(table: string, sql: string): T[] {
    return this.hasTable(table) ? (this.dbs.db.prepare(sql).all() as T[]) : [];
  }

  private record(
    level: 'info' | 'warn',
    event: string,
    message: string,
    appId: string,
  ): void {
    try {
      this.logs?.record(level, event, message, { appId });
    } catch {
      // The log table is the casualty; the move itself is done or retried.
    }
  }
}

function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
