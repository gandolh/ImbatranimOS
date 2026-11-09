import * as fs from 'fs/promises';
import * as os from 'os';
import { join } from 'path';

import type { DbService } from '../../db/db.service';
import { makeTestDb } from '../identity/testing';
import type { InstalledApps } from '../app-identity/installed-apps';
import { ModeStore } from '../app-identity/mode-store.service';
import type { LogService } from '../logs/log.service';
import { AppDataService } from './app-data.service';
import { DataMovesService } from './data-moves.service';
import { FilesService } from '../files/files.service';
import { RecentService } from '../files/recent.service';

describe('DataMovesService', () => {
  let home: string;
  let dbs: DbService;
  let modes: ModeStore;
  let data: AppDataService;
  let logged: { level: string; event: string; msg: string }[];
  let moves: DataMovesService;
  /** Whether the stand-in catalog check calls the apps uninstalled. */
  let gone: boolean;
  const prevRoot = process.env.FILES_ROOT;

  beforeEach(async () => {
    home = await fs.mkdtemp(join(os.tmpdir(), 'imb-moves-home-'));
    process.env.FILES_ROOT = home;
    dbs = makeTestDb();
    modes = new ModeStore(dbs);
    // Accessories is in the catalog and not installed: the app is "gone",
    // which a move must not mind.
    gone = true;
    const installed = { isGone: () => gone } as unknown as InstalledApps;
    data = new AppDataService(modes, installed);
    logged = [];
    const logs = {
      record: (level: string, event: string, msg: string) =>
        logged.push({ level, event, msg }),
    } as unknown as LogService;
    moves = new DataMovesService(
      dbs,
      data,
      new FilesService(),
      new RecentService(dbs),
      logs,
    );
  });

  afterEach(async () => {
    process.env.FILES_ROOT = prevRoot;
    dbs.onModuleDestroy();
    await fs.rm(home, { recursive: true, force: true });
  });

  const folder = (app: string, rest = '') =>
    join(home, '.local', 'share', 'imbatranim', app, rest);
  const readJson = async (app: string, rest: string) =>
    JSON.parse(await fs.readFile(folder(app, rest), 'utf8')) as unknown;
  const hasTable = (name: string) =>
    dbs.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined;

  function seedTodos(): void {
    dbs.db.exec(`
      INSERT INTO todo_lists (id, name, position) VALUES (3, 'Work', 1);
      INSERT INTO todos (id, text, completed, position, due_at, priority, list_id, created_at, updated_at)
        VALUES (1, 'Walk the dog', 0, 2, NULL, 0, NULL, '2026-11-01 08:00:00', '2026-11-01 08:00:00'),
               (2, 'Send the report', 1, 1, 1762700000000, 1, 3, '2026-11-02 09:00:00', '2026-11-03 10:00:00');
    `);
  }

  function seedBookmarks(): void {
    dbs.db.exec(`
      INSERT INTO bookmark_groups (id, name, icon, parent_id, position) VALUES
        (1, 'Work', NULL, NULL, 1),
        (2, 'Tools', NULL, 1, 1);
      INSERT INTO bookmark_links (id, group_id, title, url, icon, position) VALUES
        (5, 2, 'Tracker', 'https://tracker.example', NULL, 1);
    `);
  }

  it("writes Todo's rows as one file per list and one of unfiled tasks, then drops the tables", async () => {
    seedTodos();
    await moves.run();

    expect(await readJson('todo', 'lists/3.json')).toEqual({
      id: 3,
      name: 'Work',
      position: 1,
      todos: [
        {
          id: 2,
          text: 'Send the report',
          completed: true,
          position: 1,
          dueAt: 1762700000000,
          priority: true,
          createdAt: '2026-11-02 09:00:00',
          updatedAt: '2026-11-03 10:00:00',
        },
      ],
    });
    expect(await readJson('todo', 'unfiled.json')).toEqual({
      todos: [
        expect.objectContaining({
          id: 1,
          text: 'Walk the dog',
          completed: false,
        }),
      ],
    });
    expect(hasTable('todos')).toBe(false);
    expect(hasTable('todo_lists')).toBe(false);
    expect(logged).toContainEqual(
      expect.objectContaining({
        event: 'app-data.move.done',
        msg: "Todo's data moved into its folder: 2 tasks in 1 list.",
      }),
    );
  });

  it("writes Bookmarks' rows as one file of folders and links", async () => {
    seedBookmarks();
    await moves.run();
    expect(await readJson('bookmarks', 'bookmarks.json')).toEqual({
      groups: [
        {
          id: 1,
          name: 'Work',
          icon: null,
          parentId: null,
          position: 1,
          links: [],
        },
        {
          id: 2,
          name: 'Tools',
          icon: null,
          parentId: 1,
          position: 1,
          links: [
            {
              id: 5,
              title: 'Tracker',
              url: 'https://tracker.example',
              icon: null,
              position: 1,
            },
          ],
        },
      ],
    });
    expect(hasTable('bookmark_groups')).toBe(false);
    expect(hasTable('bookmark_links')).toBe(false);
  });

  it("moves Git GUI's recent repositories into its state folder and its OS recents", async () => {
    await fs.mkdir(join(home, 'code', 'old'), { recursive: true });
    await fs.mkdir(join(home, 'code', 'new'), { recursive: true });
    dbs.db.exec(`
      INSERT INTO git_recent_repos (root, path, app_id, last_opened) VALUES
        ('home', 'code/old', 'git-gui', '2026-11-01 08:00:00'),
        ('home', 'code/new', 'git-gui', '2026-11-05 08:00:00'),
        ('home', 'code/users', NULL, '2026-11-06 08:00:00'),
        ('notes', 'other', 'hollow', '2026-11-07 08:00:00');
    `);
    await moves.run();
    const state = join(home, '.local', 'state', 'imbatranim', 'git-gui');
    expect(
      JSON.parse(await fs.readFile(join(state, 'recents.json'), 'utf8')),
    ).toEqual({
      repos: [
        { root: 'home', path: 'code/new' },
        { root: 'home', path: 'code/old' },
      ],
    });
    expect(modes.stat(join(state, 'recents.json'))).toEqual({
      owner: 'git-gui',
      group: 'git-gui',
      mode: 0o600,
    });
    expect(
      dbs.db
        .prepare(
          'SELECT root, path, app_id, writable, kind, last_opened FROM recent_files ORDER BY path',
        )
        .all(),
    ).toEqual([
      {
        root: 'home',
        path: 'code/new',
        app_id: 'git-gui',
        writable: 1,
        kind: 'folder',
        last_opened: '2026-11-05 08:00:00',
      },
      {
        root: 'home',
        path: 'code/old',
        app_id: 'git-gui',
        writable: 1,
        kind: 'folder',
        last_opened: '2026-11-01 08:00:00',
      },
    ]);
    expect(hasTable('git_recent_repos')).toBe(false);
    expect(logged).toContainEqual(
      expect.objectContaining({
        event: 'app-data.move.done',
        msg: "Git GUI's data moved into its folder: 2 recent repositories.",
      }),
    );
  });

  it("leaves a recent already at a repository's path as it is", async () => {
    await fs.mkdir(join(home, 'code', 'repo'), { recursive: true });
    dbs.db.exec(`
      INSERT INTO recent_files (root, path, app_id, writable, kind)
        VALUES ('home', 'code/repo', 'code-editor', 1, 'folder');
      INSERT INTO git_recent_repos (root, path, app_id)
        VALUES ('home', 'code/repo', 'git-gui');
    `);
    await moves.run();
    expect(dbs.db.prepare('SELECT app_id FROM recent_files').all()).toEqual([
      { app_id: 'code-editor' },
    ]);
    expect(hasTable('git_recent_repos')).toBe(false);
  });

  it('moves only repositories still there as folders, the newest ten', async () => {
    await fs.mkdir(join(home, 'code'), { recursive: true });
    await fs.writeFile(join(home, 'code', 'now-a-file'), 'x');
    const insert = dbs.db.prepare(
      `INSERT INTO git_recent_repos (root, path, app_id, last_opened)
       VALUES ('home', ?, 'git-gui', ?)`,
    );
    insert.run('code/gone', '2026-11-08 00:00:00');
    insert.run('code/now-a-file', '2026-11-07 00:00:00');
    for (let i = 0; i < 12; i++) {
      const path = `code/r${String(i).padStart(2, '0')}`;
      await fs.mkdir(join(home, path));
      insert.run(path, `2026-11-01 00:00:${String(i).padStart(2, '0')}`);
    }
    await moves.run();
    const state = join(home, '.local', 'state', 'imbatranim', 'git-gui');
    const { repos } = JSON.parse(
      await fs.readFile(join(state, 'recents.json'), 'utf8'),
    ) as { repos: { path: string }[] };
    expect(repos.map((r) => r.path)).toEqual(
      [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map(
        (i) => `code/r${String(i).padStart(2, '0')}`,
      ),
    );
    const rows = dbs.db
      .prepare(`SELECT path FROM recent_files WHERE app_id = 'git-gui'`)
      .all() as { path: string }[];
    expect(rows).toHaveLength(10);
    expect(rows.some((r) => r.path === 'code/gone')).toBe(false);
    expect(hasTable('git_recent_repos')).toBe(false);
  });

  it("makes the files the app's own and private, though it isn't installed", async () => {
    seedTodos();
    await moves.run();
    const file = modes.stat(folder('todo', 'unfiled.json'));
    expect(file).toEqual({ owner: 'todo', group: 'todo', mode: 0o600 });
    expect(modes.stat(folder('todo'))?.owner).toBe('todo');
  });

  it('drops empty tables and writes nothing, saying nothing', async () => {
    await moves.run();
    expect(hasTable('todos')).toBe(false);
    expect(hasTable('bookmark_groups')).toBe(false);
    expect(hasTable('git_recent_repos')).toBe(false);
    await expect(fs.stat(folder('todo'))).rejects.toThrow();
    expect(logged).toEqual([]);
  });

  it('has nothing to do once the tables are gone', async () => {
    seedTodos();
    await moves.run();
    logged = [];
    await moves.run();
    expect(logged).toEqual([]);
  });

  it('queues overlapping runs, so one drops the tables and none logs a failure', async () => {
    seedTodos();
    seedBookmarks();
    await Promise.all([moves.run(), moves.run(), moves.run()]);

    expect(hasTable('todos')).toBe(false);
    expect(hasTable('bookmark_links')).toBe(false);
    expect(logged.filter((l) => l.level !== 'info')).toEqual([]);
    expect(logged.filter((l) => l.event === 'app-data.move.done')).toHaveLength(
      2,
    );
  });

  it('keeps the rows and says so when a file cannot be written, and moves at the next start', async () => {
    seedTodos();
    // A file where the app's folder should be: nothing can be written into it.
    await fs.mkdir(join(home, '.local', 'share', 'imbatranim'), {
      recursive: true,
    });
    await fs.writeFile(folder('todo'), 'in the way');
    await moves.run();
    expect(hasTable('todos')).toBe(true);
    expect(
      (dbs.db.prepare('SELECT COUNT(*) AS n FROM todos').get() as { n: number })
        .n,
    ).toBe(2);
    expect(logged).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'app-data.move.failed' }),
    );

    await fs.rm(folder('todo'));
    await moves.run();
    expect(hasTable('todos')).toBe(false);
    expect(await readJson('todo', 'unfiled.json')).toBeTruthy();
  });

  it('finishes a move that stopped part-way, leaving what it wrote', async () => {
    seedTodos();
    await moves.run();
    const unfiled = await fs.readFile(folder('todo', 'unfiled.json'), 'utf8');
    // As if the tables had not been dropped after the files were written.
    dbs.db.exec(`
      CREATE TABLE todo_lists (id INTEGER PRIMARY KEY, name TEXT, position INTEGER);
      CREATE TABLE todos (id INTEGER PRIMARY KEY, text TEXT, completed INTEGER,
        position INTEGER, due_at INTEGER, priority INTEGER, list_id INTEGER,
        created_at TEXT, updated_at TEXT);
    `);
    seedTodos();
    await moves.run();
    expect(hasTable('todos')).toBe(false);
    expect(await fs.readFile(folder('todo', 'unfiled.json'), 'utf8')).toBe(
      unfiled,
    );
  });

  it('keeps the rows and says so when the tables cannot be dropped, never throwing', async () => {
    seedTodos();
    // The drop is the move's only transaction.
    const spy = jest.spyOn(dbs.db, 'transaction').mockImplementationOnce((() =>
      () => {
        throw new Error('database is locked');
      }) as never);
    await expect(moves.run()).resolves.toBeUndefined();
    spy.mockRestore();
    expect(hasTable('todos')).toBe(true);
    expect(logged).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'app-data.move.failed' }),
    );

    await moves.run();
    expect(hasTable('todos')).toBe(false);
  });

  it('sets the tables aside once the app has written a planned file since, recreating nothing', async () => {
    seedTodos();
    await moves.run();
    // The tables outlive the move (a crash before the drop, or a restored
    // database), and the installed app then deletes its list and edits.
    dbs.db.exec(`
      CREATE TABLE todo_lists (id INTEGER PRIMARY KEY, name TEXT, position INTEGER);
      CREATE TABLE todos (id INTEGER PRIMARY KEY, text TEXT, completed INTEGER,
        position INTEGER, due_at INTEGER, priority INTEGER, list_id INTEGER,
        created_at TEXT, updated_at TEXT);
    `);
    seedTodos();
    gone = false;
    const todoApp = {
      appId: 'todo',
      instanceId: 'todo-1',
      windowId: null,
      groups: ['todo', 'accessories'],
    };
    await data.remove(todoApp, 'data', 'lists/3.json');
    await data.write(todoApp, 'data', 'unfiled.json', '{"todos":[]}\n');
    logged = [];

    await moves.run();
    await expect(fs.stat(folder('todo', 'lists/3.json'))).rejects.toThrow();
    expect(await fs.readFile(folder('todo', 'unfiled.json'), 'utf8')).toBe(
      '{"todos":[]}\n',
    );
    expect(hasTable('todos')).toBe(false);
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    expect(hasTable(`todos_premove_${day}`)).toBe(true);
    expect(hasTable(`todo_lists_premove_${day}`)).toBe(true);
    expect(logged).toEqual([
      expect.objectContaining({
        level: 'warn',
        event: 'app-data.move.set-aside',
      }),
    ]);

    logged = [];
    await moves.run();
    expect(logged).toEqual([]);
  });

  it('adopts a file it wrote whose mode row a crash lost, and finishes', async () => {
    seedTodos();
    await moves.run();
    const unfiled = folder('todo', 'unfiled.json');
    dbs.db.exec(`
      CREATE TABLE todo_lists (id INTEGER PRIMARY KEY, name TEXT, position INTEGER);
      CREATE TABLE todos (id INTEGER PRIMARY KEY, text TEXT, completed INTEGER,
        position INTEGER, due_at INTEGER, priority INTEGER, list_id INTEGER,
        created_at TEXT, updated_at TEXT);
    `);
    seedTodos();
    modes.remove(unfiled);
    expect(modes.stat(unfiled)).toBeNull();
    await moves.run();
    expect(hasTable('todos')).toBe(false);
    expect(modes.stat(unfiled)).toEqual({
      owner: 'todo',
      group: 'todo',
      mode: 0o600,
    });
  });

  it('keeps the rows when a file would pass the size limit, and says so', async () => {
    const big = 'x'.repeat(260);
    const insert = dbs.db.prepare(
      "INSERT INTO todos (text, completed, position, created_at, updated_at) VALUES (?, 0, ?, '', '')",
    );
    // Over 5 MB of JSON in unfiled.json.
    dbs.db.transaction(() => {
      for (let i = 0; i < 20_000; i++) insert.run(big, i + 1);
    })();
    await moves.run();
    expect(hasTable('todos')).toBe(true);
    expect(logged).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'app-data.move.failed' }),
    );
    await expect(fs.stat(folder('todo', 'unfiled.json'))).rejects.toThrow();
  });
});
