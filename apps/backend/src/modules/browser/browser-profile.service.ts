import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { DbService } from '../../db/db.service';

/** The cookie jar is refused past this size. Real jars are tens of KB. */
export const MAX_JAR_BYTES = 1_000_000;

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT = 1;
const AAD = Buffer.from('imbatranimos/browser-profile/v1');

/**
 * Where the profile key lives: beside the database, as its own file. The
 * backup leaves it out (see BackupService), so a backup carries only
 * ciphertext, and a leaked backup leaks no site's sign-in.
 */
export function browserProfileKeyPath(dbPath: string): string {
  return join(dirname(dbPath), 'browser-profile.key');
}

/**
 * The Browser's profile (brief 50): the proxied sites' cookie jar, kept by the
 * machine rather than the laptop viewing it, so a site stays signed in across
 * container restarts and from whichever browser opens the desktop.
 *
 * Scramjet keeps cookies itself, in the viewing browser, because the real
 * browser never sees the proxied sites' origins. The Browser app reads that jar
 * out and writes it here; here it is stored AES-256-GCM encrypted. The key is a
 * random per-machine file, not derived from a password: in the estate there is
 * no password to derive from, and the local sign-in's can change.
 *
 * A jar that cannot be decrypted (the key file was lost, or a backup from
 * another machine was restored) reads as empty. Losing it signs you out of
 * websites, nothing more.
 */
@Injectable()
export class BrowserProfileService {
  private readonly logger = new Logger(BrowserProfileService.name);
  private key: Buffer | null = null;

  constructor(private readonly dbs: DbService) {}

  private keyPath(): string {
    return browserProfileKeyPath(this.dbs.path());
  }

  /** The key, created on first use. Null for an in-memory database (tests): then one per process. */
  private loadKey(create: boolean): Buffer | null {
    if (this.key) return this.key;
    if (this.dbs.path() === ':memory:') {
      this.key = randomBytes(KEY_BYTES);
      return this.key;
    }
    const path = this.keyPath();
    try {
      const key = readFileSync(path);
      if (key.length === KEY_BYTES) {
        this.key = key;
        return key;
      }
      this.logger.error(`${path} is not a profile key; ignoring it`);
      return null;
    } catch {
      if (!create) return null;
    }
    const key = randomBytes(KEY_BYTES);
    mkdirSync(dirname(path), { recursive: true });
    // `wx`: never overwrite a key another request just wrote.
    try {
      writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
      this.key = key;
      return key;
    } catch {
      return this.loadKey(false);
    }
  }

  /** The stored jar, decrypted, or null when there is none or it cannot be read. */
  read(): { jar: string | null; updatedAt: number | null } {
    const row = this.dbs.db
      .prepare('SELECT blob, updated_at FROM browser_profile WHERE id = 1')
      .get() as { blob: Buffer; updated_at: number } | undefined;
    if (!row) return { jar: null, updatedAt: null };
    const key = this.loadKey(false);
    const jar = key ? decrypt(row.blob, key) : null;
    if (jar === null) {
      this.logger.warn('The stored browser profile cannot be decrypted');
    }
    return { jar, updatedAt: jar === null ? null : row.updated_at };
  }

  write(jar: string, now = Date.now()): void {
    if (Buffer.byteLength(jar) > MAX_JAR_BYTES) {
      throw new BadRequestException('The cookie jar is too large');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jar);
    } catch {
      throw new BadRequestException('The cookie jar is not JSON');
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new BadRequestException('The cookie jar is not an object');
    }
    const key = this.loadKey(true);
    if (!key) throw new Error('No browser profile key');
    this.dbs.db
      .prepare(
        `INSERT INTO browser_profile (id, blob, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at`,
      )
      .run(encrypt(jar, key), now);
  }

  clear(): void {
    this.dbs.db.prepare('DELETE FROM browser_profile').run();
  }
}

function encrypt(text: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT]), iv, cipher.getAuthTag(), body]);
}

function decrypt(blob: Buffer, key: Buffer): string | null {
  if (blob.length < 1 + IV_BYTES + TAG_BYTES || blob[0] !== FORMAT) {
    return null;
  }
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(blob.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
