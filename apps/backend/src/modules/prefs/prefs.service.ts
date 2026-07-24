import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import type { PrefsMap } from './dto/prefs.dto';

interface PrefRow {
  key: string;
  value: string;
}

/**
 * Server-side "dotfiles": a tiny single-user key/value store so frontend
 * stores can persist durable config across devices/reinstalls. Values are
 * arbitrary JSON, stored as TEXT and parsed/serialized at the boundary.
 */
@Injectable()
export class PrefsService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  // Table lives here rather than in the shared db.service.ts migration list —
  // create-if-not-exists on this service's own init, same effect, self-contained.
  onModuleInit() {
    this.db.db.exec(`
      CREATE TABLE IF NOT EXISTS prefs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  findAll(): PrefsMap {
    const rows = this.db.db
      .prepare('SELECT key, value FROM prefs')
      .all() as PrefRow[];

    // Object.create(null) rather than {}: a stored key literally named
    // `__proto__` would otherwise set the object's prototype instead of
    // becoming an own property, silently vanishing from the response.
    const result: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        // A single corrupt row shouldn't 500 the whole GET; skip it and keep
        // serving the rest of the map.
        continue;
      }
    }
    return result;
  }

  upsertMany(body: PrefsMap): void {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException(
        'Body must be a JSON object of key/value pairs',
      );
    }

    const entries = Object.entries(body);
    if (entries.length === 0) return;

    const stmt = this.db.db.prepare(
      `INSERT INTO prefs (key, value, updated_at) VALUES (@key, @value, @updated_at)
       ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at`,
    );

    const upsertAll = this.db.db.transaction((pairs: [string, unknown][]) => {
      const now = Date.now();
      for (const [key, value] of pairs) {
        stmt.run({ key, value: JSON.stringify(value), updated_at: now });
      }
    });

    upsertAll(entries);
  }

  // Idempotent by design: this backs an optional migration cleanup, so a
  // caller retrying (or deleting an already-absent key) should not error.
  remove(key: string): void {
    this.db.db.prepare('DELETE FROM prefs WHERE key = ?').run(key);
  }
}
