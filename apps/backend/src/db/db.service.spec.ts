import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DbService } from './db.service';
import { StorageHealthGuard } from './storage-health.guard';
import type { Env } from '../config/env.schema';

/**
 * The migration ledger (brief 110).
 *
 * The pins that matter: a fully-migrated database and a restored 2026-01
 * backup are BOTH `user_version = 0`, so the conversion has to run every step
 * with narrow expected-skips rather than blind-stamping; and a real failure
 * (disk full, read-only) must stop looking like "column already exists".
 */

function configFor(path: string): ConfigService<Env, true> {
  return {
    get: (key: string) => (key === 'DB_PATH' ? path : undefined),
  } as unknown as ConfigService<Env, true>;
}

function openService(path: string): DbService {
  const svc = new DbService(configFor(path));
  svc.onModuleInit();
  return svc;
}

/** The comparable shape of a database: tables, and each table's columns. */
function schemaDump(db: Database.Database): string {
  const tables = (
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
  return tables
    .map((name) => {
      const cols = (
        db.prepare(`PRAGMA table_info(${name})`).all() as {
          name: string;
          type: string;
        }[]
      )
        .map((c) => `${c.name}:${c.type}`)
        .sort()
        .join(',');
      return `${name}(${cols})`;
    })
    .join('\n');
}

describe('DbService migration ledger — brief 110', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imb-b110-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a fresh database ends stamped at the newest version', () => {
    const svc = openService(join(dir, 'fresh.sqlite'));
    expect(Number(svc.db.pragma('user_version', { simple: true }))).toBe(7);
    expect(svc.migrationFailure).toBeNull();
    svc.onModuleDestroy();
  });

  it('an OLD-shape database migrates to exactly the fresh schema', () => {
    // Build a pre-brief-73/75/94 database by hand at version 0.
    const oldPath = join(dir, 'old.sqlite');
    const raw = new Database(oldPath);
    raw.exec(`
      CREATE TABLE recent_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        last_opened DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE bookmark_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT
      );
      CREATE TABLE bookmark_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        title TEXT NOT NULL,
        href TEXT NOT NULL,
        icon TEXT
      );
    `);
    raw.prepare(`INSERT INTO todos (text) VALUES ('carried over')`).run();
    expect(Number(raw.pragma('user_version', { simple: true }))).toBe(0);
    raw.close();

    const migrated = openService(oldPath);
    const fresh = openService(join(dir, 'fresh.sqlite'));

    expect(migrated.migrationFailure).toBeNull();
    expect(Number(migrated.db.pragma('user_version', { simple: true }))).toBe(
      7,
    );
    // The whole point: a migrated database is indistinguishable from a fresh one.
    expect(schemaDump(migrated.db)).toBe(schemaDump(fresh.db));
    // …and the user's data came with it.
    expect(migrated.db.prepare(`SELECT text FROM todos`).all()).toEqual([
      { text: 'carried over' },
    ]);
    // The old-shape recent_files was dropped and rebuilt (brief 94).
    const recentCols = (
      migrated.db.prepare(`PRAGMA table_info(recent_files)`).all() as {
        name: string;
      }[]
    ).map((c) => c.name);
    expect(recentCols).toContain('root');

    migrated.onModuleDestroy();
    fresh.onModuleDestroy();
  });

  it('an already-migrated PRE-LEDGER database converts, then runs nothing', () => {
    const path = join(dir, 'current.sqlite');
    // Migrate once, then pretend it predates the ledger.
    const first = openService(path);
    first.db.pragma('user_version = 0');
    const before = schemaDump(first.db);

    // The conversion re-attempts every historical step; the narrow
    // expected-skips are what make that safe.
    first.migrate();
    expect(first.migrationFailure).toBeNull();
    expect(Number(first.db.pragma('user_version', { simple: true }))).toBe(7);
    expect(schemaDump(first.db)).toBe(before);

    // A second run is a single PRAGMA read: nothing left above the stamp.
    first.migrate();
    expect(Number(first.db.pragma('user_version', { simple: true }))).toBe(7);
    first.onModuleDestroy();
  });

  it('a REAL failure is recorded, does not stamp past the step, and 503s', () => {
    const path = join(dir, 'broken.sqlite');
    // A genuinely unexpected error, not an expected skip: an object of the
    // same name already exists, so the baseline CREATE cannot proceed. (File
    // permissions cannot simulate this — the container runs as root, which
    // ignores them.) The old bare `catch {}` would have swallowed exactly this
    // class of error and left the schema half-built.
    const raw = new Database(path);
    raw.exec(
      `CREATE TABLE t (a INTEGER); CREATE VIEW sticky_notes AS SELECT * FROM t`,
    );
    raw.close();

    const svc = openService(path);
    // `CREATE TABLE IF NOT EXISTS` treats the view as already-existing, so
    // step 1 passes and step 2's ALTER hits it — "Cannot add a column to a
    // view", a plain SQLITE_ERROR that is NOT a duplicate column. The old
    // bare `catch {}` swallowed exactly this and carried on half-migrated.
    expect(svc.migrationFailure).toMatch(/migration 2 \(sticky-note-columns\)/);
    expect(svc.migrationFailure).toMatch(/Cannot add a column to a view/);
    // Stamped at 1, not 2: the next boot resumes at the failed step.
    expect(Number(svc.db.pragma('user_version', { simple: true }))).toBe(1);

    // …and every API request answers honestly instead of 500ing later.
    const guard = new StorageHealthGuard(svc);
    expect(() => guard.canActivate()).toThrow(/System storage needs attention/);

    // Clear the obstruction and let it run from the beginning (step 1 owns the
    // real table, and the ledger already counted it done).
    svc.db.exec('DROP VIEW sticky_notes');
    svc.db.pragma('user_version = 0');
    svc.migrate();
    expect(svc.migrationFailure).toBeNull();
    expect(Number(svc.db.pragma('user_version', { simple: true }))).toBe(7);
    expect(new StorageHealthGuard(svc).canActivate()).toBe(true);
    svc.onModuleDestroy();
  });

  it('a VACUUM INTO snapshot carries the stamp (brief 80 restores stay current)', () => {
    const svc = openService(join(dir, 'src.sqlite'));
    const snap = join(dir, 'snap.sqlite');
    svc.snapshotTo(snap);

    const copy = new Database(snap);
    expect(Number(copy.pragma('user_version', { simple: true }))).toBe(
      Number(svc.db.pragma('user_version', { simple: true })),
    );
    copy.close();
    svc.onModuleDestroy();
  });
});

describe('DbService — pre-Ward credential tables are dropped (brief 150)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'imb-b150-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const tables = (db: Database.Database) =>
    (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all() as { name: string }[]
    ).map((t) => t.name);

  it('a pre-ledger database holding a password hash migrates to 7 without either table', () => {
    const path = join(dir, 'upgraded.sqlite');
    // What every install from before 2026-09-06 has: the owner's password hash,
    // TOTP secret and sessions, at user_version 0.
    const old = new Database(path);
    old.exec(`
      CREATE TABLE auth_user (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE auth_sessions (
        token TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      INSERT INTO auth_user (id, username, password_hash, totp_secret, totp_enabled)
        VALUES (1, 'owner', 'hash-of-the-owners-password', 'JBSWY3DPEHPK3PXP', 1);
      INSERT INTO auth_sessions VALUES ('tok', datetime('now'), datetime('now', '+1 day'));
    `);
    old.close();

    const svc = openService(path);
    expect(svc.migrationFailure).toBeNull();
    expect(Number(svc.db.pragma('user_version', { simple: true }))).toBe(7);
    expect(tables(svc.db)).not.toContain('auth_user');
    expect(tables(svc.db)).not.toContain('auth_sessions');

    // And a backup taken now carries neither.
    const snap = join(dir, 'snap.sqlite');
    svc.snapshotTo(snap);
    const copy = new Database(snap, { readonly: true });
    expect(tables(copy)).not.toContain('auth_user');
    expect(tables(copy)).not.toContain('auth_sessions');
    copy.close();
    svc.onModuleDestroy();
  });

  it('a fresh database ends without them too', () => {
    const svc = openService(join(dir, 'fresh.sqlite'));
    expect(tables(svc.db)).not.toContain('auth_user');
    expect(tables(svc.db)).not.toContain('auth_sessions');
    svc.onModuleDestroy();
  });
});
