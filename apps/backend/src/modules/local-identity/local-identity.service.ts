import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import type { Env } from '../../config/env.schema';
import { DbService } from '../../db/db.service';
import { AuthenticationError, type Caller } from '../identity/identity.types';
import { hashPassword, verifyPassword } from './password';
import { SignInThrottle } from './throttle';

/** The session cookie. */
export const LOCAL_SESSION_COOKIE = 'imb_session';

/** A local session lasts 30 days from sign-in; signing out or a restore ends it sooner. */
export const LOCAL_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

/** A password shorter than this is refused at setup and on change. */
export const MIN_PASSWORD_LENGTH = 10;

/** The subject every local session carries. There is one owner, so one subject. */
export const LOCAL_SUBJECT = 'local-owner';

export class SetupRefusedError extends Error {
  override readonly name = 'SetupRefusedError';
}
export class ThrottledError extends Error {
  override readonly name = 'ThrottledError';
  constructor(readonly retryAfterMs: number) {
    super('Too many failed sign-ins; wait before trying again');
  }
}

export interface LocalStatus {
  /** True once an owner has chosen a password. */
  setUp: boolean;
  /** True when the first-run claim also needs the operator's SETUP_TOKEN. */
  setupTokenRequired: boolean;
}

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  if (header === undefined) return undefined;
  const flat = Array.isArray(header) ? header.join('; ') : header;
  for (const pair of flat.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq).trim() !== name) continue;
    const value = pair.slice(eq + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/**
 * The single-owner sign-in (brief 152), the machine's only identity path
 * since brief 157 (`decisions-estate-era.md`).
 *
 * `authenticate` turns a `Cookie` header into a {@link Caller} or throws
 * {@link AuthenticationError}. The global guard, `/api/me` and every
 * WebSocket upgrade call it, so there is no second code path.
 *
 * The session's `sid` is a prefix of its token hash, which is stable for the
 * session and reveals nothing usable.
 */
@Injectable()
export class LocalIdentityService implements OnModuleInit {
  private readonly throttle = new SignInThrottle();
  private setupToken: string | undefined;

  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The operator's out-of-band first-run token, from the environment. */
  onModuleInit(): void {
    this.setupToken = this.config.get('SETUP_TOKEN', { infer: true });
  }

  private owner(): { username: string; password_hash: string } | undefined {
    return this.dbs.db
      .prepare('SELECT username, password_hash FROM local_owner WHERE id = 1')
      .get() as { username: string; password_hash: string } | undefined;
  }

  status(): LocalStatus {
    const setUp = this.owner() !== undefined;
    return { setUp, setupTokenRequired: !setUp && !!this.setupToken };
  }

  /**
   * Claim the machine: the first owner's name and password. Refused once an
   * owner exists, and refused without the right `SETUP_TOKEN` when one is set.
   */
  async setUp(input: {
    username: string;
    password: string;
    setupToken?: string;
  }): Promise<void> {
    if (this.owner())
      throw new SetupRefusedError('This machine already has an owner');
    if (this.setupToken) {
      const given = Buffer.from(input.setupToken ?? '');
      const want = Buffer.from(this.setupToken);
      if (given.length !== want.length || !timingSafeEqual(given, want)) {
        throw new SetupRefusedError('The setup token is not right');
      }
    }
    this.checkPassword(input.password);
    const username = input.username.trim();
    if (!username) throw new SetupRefusedError('Choose a name');
    const now = Date.now();
    const passwordHash = await hashPassword(input.password);
    // INSERT, not UPSERT: two racing claims cannot both win, because the
    // CHECK (id = 1) primary key refuses the second.
    try {
      this.dbs.db
        .prepare(
          'INSERT INTO local_owner (id, username, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?)',
        )
        .run(username, passwordHash, now, now);
    } catch {
      throw new SetupRefusedError('This machine already has an owner');
    }
  }

  /** Check the password and open a session. Returns the raw cookie value. */
  async signIn(
    password: string,
    clientKey: string,
    now = Date.now(),
  ): Promise<{ token: string; expiresAt: number }> {
    const wait = this.throttle.waitFor(clientKey, now);
    if (wait > 0) throw new ThrottledError(wait);
    const owner = this.owner();
    const ok =
      owner !== undefined &&
      (await verifyPassword(password, owner.password_hash));
    if (!ok) {
      this.throttle.fail(clientKey, now);
      throw new AuthenticationError('Wrong password');
    }
    this.throttle.succeed(clientKey);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + LOCAL_SESSION_TTL_MS;
    this.dbs.db
      .prepare(
        'INSERT INTO local_session (token_hash, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(hash(token), now, now, expiresAt);
    return { token, expiresAt };
  }

  /** Cookie → live session, or `AuthenticationError`. */
  authenticate(
    cookieHeader: string | string[] | undefined,
    now = Date.now(),
  ): Promise<Caller> {
    // A Promise, though nothing here waits (one indexed SQLite read), so the
    // callers do not change if a check ever has to go off-box.
    try {
      return Promise.resolve(this.resolve(cookieHeader, now));
    } catch (err) {
      return Promise.reject(err as Error);
    }
  }

  private resolve(
    cookieHeader: string | string[] | undefined,
    now: number,
  ): Caller {
    const token = readCookie(cookieHeader, LOCAL_SESSION_COOKIE);
    if (!token) throw new AuthenticationError('No session');
    const tokenHash = hash(token);
    const row = this.dbs.db
      .prepare(
        'SELECT expires_at, last_seen FROM local_session WHERE token_hash = ?',
      )
      .get(tokenHash) as { expires_at: number; last_seen: number } | undefined;
    const owner = this.owner();
    if (!row || row.expires_at <= now || !owner) {
      throw new AuthenticationError('Session is not active');
    }
    // At most one write a minute per session, not one per request.
    if (now - row.last_seen > 60_000) {
      this.dbs.db
        .prepare('UPDATE local_session SET last_seen = ? WHERE token_hash = ?')
        .run(now, tokenHash);
    }
    return {
      subject: LOCAL_SUBJECT,
      username: owner.username,
      sid: `local-${tokenHash.slice(0, 16)}`,
    };
  }

  /** End the session this cookie names. Silent when there is none. */
  signOut(cookieHeader: string | string[] | undefined): void {
    const token = readCookie(cookieHeader, LOCAL_SESSION_COOKIE);
    if (!token) return;
    this.dbs.db
      .prepare('DELETE FROM local_session WHERE token_hash = ?')
      .run(hash(token));
  }

  /** End every local session: after a restore, or a password change elsewhere. */
  revokeAll(): void {
    this.dbs.db.prepare('DELETE FROM local_session').run();
  }

  /**
   * Change the owner's password. Every other session ends; the one that asked
   * keeps going, so changing a password does not throw you out.
   */
  async changePassword(
    current: string,
    next: string,
    cookieHeader: string | string[] | undefined,
  ): Promise<void> {
    const owner = this.owner();
    if (!owner || !(await verifyPassword(current, owner.password_hash))) {
      throw new AuthenticationError('The current password is not right');
    }
    this.checkPassword(next);
    this.dbs.db
      .prepare(
        'UPDATE local_owner SET password_hash = ?, updated_at = ? WHERE id = 1',
      )
      .run(await hashPassword(next), Date.now());
    const keep = readCookie(cookieHeader, LOCAL_SESSION_COOKIE);
    this.dbs.db
      .prepare('DELETE FROM local_session WHERE token_hash <> ?')
      .run(keep ? hash(keep) : '');
  }

  private checkPassword(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new SetupRefusedError(
        `Use at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }
}
