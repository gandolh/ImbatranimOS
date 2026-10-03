import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';

import { DbService } from '../../db/db.service';
import type { Env } from '../../config/env.schema';
import { WardFreshness } from './ward-freshness';
import { WardAuthGuard } from './ward.guard';
import { WardService } from './ward.service';
import {
  IMBATRANIMOS_APP_SLUG,
  WardAuthenticationError,
  type WardCaller,
} from './ward.types';

/**
 * Test fixtures for a Ward-authenticated app.
 *
 * ## The fake replaces the *client*, not the guard
 *
 * `WardTestModule` provides a `WardService` whose sessions a test declares,
 * and registers the **real** `WardAuthGuard` on top of it. So an e2e suite
 * still exercises the genuine grant check, the genuine Origin check and the
 * genuine 401/403/503 split — it only gets to decide which session a cookie
 * names, which is exactly what a real Ward would be deciding.
 *
 * Stubbing the guard instead would make every "rejects without a session" test
 * in this repo tautological.
 *
 * Replaces `AuthModule` in a test's `imports`, and `TEST_COOKIE` replaces
 * `imb_session=${app.get(SessionService).issue().token}`.
 */

/** The cookie every fixture below signs in with. */
export const TEST_COOKIE = 'ward_session=test-session';
const TEST_TOKEN = 'test-session';

/** The grants a fixture session holds unless a test says otherwise. */
const DEFAULT_GRANTS: Record<string, string[]> = {
  [IMBATRANIMOS_APP_SLUG]: ['owner'],
};

/**
 * A `WardService` a test drives, mapping a cookie value to a session.
 *
 * Extends the real class so it satisfies the container and the guard's
 * constructor without a cast at every call site.
 */
export class FakeWardService extends WardService {
  private readonly sessions = new Map<string, WardCaller>();
  private broken: Error | undefined;

  constructor() {
    // The real constructor takes a ConfigService only to read three variables
    // in `onModuleInit`, which this class overrides to do nothing — so there is
    // nothing for it to read and nothing to hand it.
    super(undefined as unknown as ConfigService<Env, true>);
    this.signIn(TEST_TOKEN, 'subject_test', DEFAULT_GRANTS);
  }

  /** Overridden: there is no environment to read and no client to build. */
  override onModuleInit(): void {}

  signIn(
    token: string,
    subject: string,
    grants: Record<string, string[]> = DEFAULT_GRANTS,
  ): void {
    this.sessions.set(token, {
      active: true,
      subject,
      username: subject,
      grants,
      sid: `sid_${token}`,
    });
  }

  /** Forget a session, so the next request is unauthenticated. */
  signOut(token: string = TEST_TOKEN): void {
    this.sessions.delete(token);
  }

  /** Make every call throw — for the fail-closed (503) tests. */
  breakWith(error: Error): void {
    this.broken = error;
  }

  override authenticate(
    cookieHeader: string | string[] | undefined,
  ): Promise<WardCaller> {
    if (this.broken) return Promise.reject(this.broken);

    const flat = Array.isArray(cookieHeader)
      ? cookieHeader.join('; ')
      : (cookieHeader ?? '');
    let token: string | undefined;
    for (const pair of flat.split(';')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      if (pair.slice(0, eq).trim() !== 'ward_session') continue;
      const value = pair.slice(eq + 1).trim();
      if (value) token = value;
    }

    const session = token === undefined ? undefined : this.sessions.get(token);
    return session
      ? Promise.resolve(session)
      : Promise.reject(new WardAuthenticationError('session is not active'));
  }
}

/**
 * Drop-in replacement for `AuthModule` in a test's `imports`.
 *
 * `@Global`, matching `WardModule`, so a partial module graph still resolves
 * `WardService` wherever a gateway injects it.
 */
@Global()
@Module({
  providers: [
    { provide: WardService, useClass: FakeWardService },
    WardFreshness,
    { provide: APP_GUARD, useClass: WardAuthGuard },
  ],
  exports: [WardService, WardFreshness],
})
export class WardTestModule {}

/**
 * Build a DbService backed by a fresh in-memory SQLite DB, running the real
 * migrations. Test-only.
 *
 * Lives here now because it used to live in `auth/test-utils.ts`, which went
 * with the auth module. It has nothing to do with Ward beyond that history —
 * if a third caller appears, move it somewhere neutral.
 */
export function makeTestDb(): DbService {
  const config = {
    get: (key: string) => (key === 'DB_PATH' ? ':memory:' : undefined),
  } as unknown as ConfigService<Env, true>;
  const db = new DbService(config);
  db.onModuleInit();
  return db;
}

/** A ConfigService stub returning the given values, with sane defaults. */
export function makeConfig(
  overrides: Partial<Record<keyof Env, unknown>> = {},
): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    TRUST_PROXY: false,
    FRONTEND_URL: 'http://localhost:5173',
    WARD_PUBLIC_ORIGIN: 'https://gandolh.ro',
    WARD_API_BASE_PATH: '/ward-api',
    WARD_APP_KEY: 'wak_test',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
}
