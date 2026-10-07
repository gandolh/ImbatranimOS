import { Global, Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';

import { DbService } from '../../db/db.service';
import type { Env } from '../../config/env.schema';
import {
  LOCAL_SESSION_COOKIE,
  LocalIdentityService,
} from '../local-identity/local-identity.service';
import { SessionGuard } from './identity.guard';
import { AuthenticationError, type Caller } from './identity.types';

/**
 * Test fixtures for a guarded app.
 *
 * ## The fake replaces the sign-in, not the guard
 *
 * `IdentityTestModule` provides a `LocalIdentityService` whose sessions a test
 * declares, and registers the **real** `SessionGuard` on top of it. So an e2e
 * suite still exercises the genuine Origin check and the genuine 401: it only
 * decides which session a cookie names. Stubbing the guard instead would make
 * every "rejects without a session" test tautological.
 *
 * `local-identity.e2e-spec.ts` covers the real sign-in end to end.
 */

const TEST_TOKEN = 'test-session';

/** The cookie every fixture below signs in with. */
export const TEST_COOKIE = `${LOCAL_SESSION_COOKIE}=${TEST_TOKEN}`;

/**
 * A `LocalIdentityService` a test drives, mapping a cookie value to a session.
 *
 * Extends the real class so it satisfies the container and the guard's
 * constructor without a cast at every call site.
 */
// Decorated so Nest reads THIS constructor (no arguments) rather than
// inheriting the real one's parameter list.
@Injectable()
export class FakeIdentityService extends LocalIdentityService {
  private readonly sessions = new Map<string, Caller>();

  constructor() {
    // The real constructor's database and config are only read by the methods
    // this class overrides or that no test using it calls.
    super(
      undefined as unknown as DbService,
      undefined as unknown as ConfigService<Env, true>,
    );
    this.signInAs(TEST_TOKEN, 'subject_test');
  }

  /** Overridden: there is no environment to read. */
  override onModuleInit(): void {}

  signInAs(token: string, subject: string): void {
    this.sessions.set(token, {
      subject,
      username: subject,
      sid: `sid_${token}`,
    });
  }

  /** Forget a session, so the next request is unauthenticated. */
  forget(token: string = TEST_TOKEN): void {
    this.sessions.delete(token);
  }

  override authenticate(
    cookieHeader: string | string[] | undefined,
  ): Promise<Caller> {
    const flat = Array.isArray(cookieHeader)
      ? cookieHeader.join('; ')
      : (cookieHeader ?? '');
    let token: string | undefined;
    for (const pair of flat.split(';')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      if (pair.slice(0, eq).trim() !== LOCAL_SESSION_COOKIE) continue;
      const value = pair.slice(eq + 1).trim();
      if (value) token = value;
    }

    const session = token === undefined ? undefined : this.sessions.get(token);
    return session
      ? Promise.resolve(session)
      : Promise.reject(new AuthenticationError('Session is not active'));
  }
}

/**
 * The identity half of a test's `imports`. `@Global`, matching
 * `IdentityModule`, so a partial module graph still resolves the service
 * wherever a gateway injects it.
 */
@Global()
@Module({
  providers: [
    { provide: LocalIdentityService, useClass: FakeIdentityService },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [LocalIdentityService],
})
export class IdentityTestModule {}

/**
 * Build a DbService backed by a fresh in-memory SQLite DB, running the real
 * migrations. Test-only.
 */
export function makeTestDb(): DbService {
  const config = {
    get: (key: string) => (key === 'DB_PATH' ? ':memory:' : undefined),
  } as unknown as ConfigService<Env, true>;
  const db = new DbService(config);
  db.onModuleInit();
  return db;
}

/** The real sign-in over `db`, with no SETUP_TOKEN. Test-only. */
export function makeLocalIdentity(db: DbService): LocalIdentityService {
  const config = {
    get: () => undefined,
  } as unknown as ConfigService<Env, true>;
  const identity = new LocalIdentityService(db, config);
  identity.onModuleInit();
  return identity;
}
