import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';

import { DbService } from '../../db/db.service';
import { LogService } from '../logs/log.service';
import type { AppIdentity } from '../app-identity/app-identity.types';
import { AppDataService } from './app-data.service';

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
 * Ids, positions and timestamps are kept as they were, so the apps show the
 * same order, and a due-date toast already claimed is not claimed again.
 *
 * The files are written as the app, owned by it and private, whether or not
 * it is installed yet: they wait in its folder. Once every file is in place
 * the tables are dropped in one transaction. A write that fails keeps every
 * row, says so in Logs, and the move runs again at the next start; a file the
 * move already wrote is left as it is, and one the app wrote since is never
 * written over (that move then waits, and says so each start).
 */

/** An app whose rows move, and the tables they leave. */
type Move = {
  appId: string;
  /** The app's install group, the descriptor that installs it. */
  group: string;
  name: string;
  tables: readonly string[];
  /** The files to write, by path in the app's data folder, and what they hold. */
  files(): { files: Map<string, string>; summary: string };
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
    // Optional, as for DbService: a partial graph without LogsModule still boots.
    @Optional() private readonly logs?: LogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  /** Every move still to do, one after the other. Never throws. */
  async run(): Promise<void> {
    // A database that failed to open or migrate answers 503 everywhere; its
    // rows wait for a start that reads them.
    if (this.dbs.migrationFailure || !this.dbs.db?.open) return;
    for (const move of [this.todoMove(), this.bookmarksMove()]) {
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
    const planned = move.files();
    const identity: AppIdentity = {
      appId: move.appId,
      instanceId: `os-move-${move.appId}`,
      windowId: null,
      groups: [move.appId, move.group],
    };
    for (const [path, content] of planned.files) {
      await this.data.place(identity, 'data', path, content);
    }
    // The files are in place; a drop that fails leaves the rows, and the
    // next start finds the same files and drops them then.
    this.dbs.db.transaction(() => {
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

  private todoMove(): Move {
    return {
      appId: 'todo',
      group: 'accessories',
      name: 'Todo',
      tables: ['todos', 'todo_lists'],
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

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
