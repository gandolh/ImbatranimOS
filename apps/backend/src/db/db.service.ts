import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import type { Env } from '../config/env.schema';

@Injectable()
export class DbService implements OnModuleInit {
  db: Database.Database;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit() {
    this.db = new Database(this.config.get('DB_PATH'));
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sticky_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL DEFAULT '',
        pos_x INTEGER NOT NULL DEFAULT 100,
        pos_y INTEGER NOT NULL DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bookmark_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT
      );

      CREATE TABLE IF NOT EXISTS bookmark_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES bookmark_groups(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        href TEXT NOT NULL,
        icon TEXT
      );

      CREATE TABLE IF NOT EXISTS recent_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        last_opened DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS repl_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT NOT NULL DEFAULT '',
        cwd TEXT NOT NULL DEFAULT '',
        prompt_prefix TEXT NOT NULL DEFAULT '>',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      this.db.exec(
        'ALTER TABLE todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0',
      );
    } catch {
      // column already exists — safe to ignore
    }
  }
}
