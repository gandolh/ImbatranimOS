import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionAuthGuard } from './auth.guard';
import { SessionService } from './session.service';
import { DbService } from '../../db/db.service';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { makeConfig, makeTestDb } from './test-utils';

function ctxFor(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  let db: DbService;
  let sessions: SessionService;
  let reflector: Reflector;
  let guard: SessionAuthGuard;
  let isPublic: boolean;

  beforeEach(() => {
    db = makeTestDb();
    sessions = new SessionService(db, makeConfig());
    isPublic = false;
    reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
    guard = new SessionAuthGuard(reflector, sessions, makeConfig());
  });

  it('rejects a protected route with no session (401)', () => {
    expect(() => guard.canActivate(ctxFor({ method: 'GET', headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows a protected route with a valid session cookie', () => {
    const { token } = sessions.issue();
    const req = {
      method: 'GET',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    };
    expect(guard.canActivate(ctxFor(req))).toBe(true);
  });

  it('allows a @Public route with no session', () => {
    isPublic = true;
    expect(guard.canActivate(ctxFor({ method: 'POST', headers: {} }))).toBe(true);
  });

  it('attaches the validated session to the request', () => {
    const { token } = sessions.issue();
    const req: any = {
      method: 'GET',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    };
    guard.canActivate(ctxFor(req));
    expect(req.session).toBeDefined();
  });

  describe('CSRF origin check', () => {
    it('rejects a cross-origin mutating request', () => {
      isPublic = true; // even public routes are origin-checked
      const req = {
        method: 'POST',
        headers: { origin: 'http://evil.example', host: 'localhost:3001' },
      };
      expect(() => guard.canActivate(ctxFor(req))).toThrow(ForbiddenException);
    });

    it('allows a same-host mutating request', () => {
      isPublic = true;
      const req = {
        method: 'POST',
        headers: { origin: 'http://localhost:3001', host: 'localhost:3001' },
      };
      expect(guard.canActivate(ctxFor(req))).toBe(true);
    });

    it('allows the configured FRONTEND_URL origin (dev cross-port)', () => {
      isPublic = true;
      const req = {
        method: 'POST',
        headers: { origin: 'http://localhost:5173', host: 'localhost:3001' },
      };
      expect(guard.canActivate(ctxFor(req))).toBe(true);
    });

    it('allows a GET with no Origin header', () => {
      isPublic = true;
      expect(guard.canActivate(ctxFor({ method: 'GET', headers: {} }))).toBe(true);
    });
  });
});
