import { isPtyUpgrade, authorizeUpgrade, isOriginAllowed } from './pty-upgrade';
import { PTY_PATH } from './pty.constants';

const FRONTEND = 'http://localhost:5173';

describe('isPtyUpgrade', () => {
  it('matches the exact pty path', () => {
    expect(isPtyUpgrade(PTY_PATH)).toBe(true);
  });

  it('matches the path with a query string', () => {
    expect(isPtyUpgrade(`${PTY_PATH}?cols=80&rows=24`)).toBe(true);
  });

  it('rejects other paths and undefined', () => {
    expect(isPtyUpgrade('/api/other')).toBe(false);
    expect(isPtyUpgrade('/api/pty/extra')).toBe(false);
    expect(isPtyUpgrade(undefined)).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('allows an absent Origin (same-origin / non-browser client)', () => {
    expect(isOriginAllowed({ headers: {} }, FRONTEND)).toBe(true);
  });

  it('allows the configured frontend origin', () => {
    expect(isOriginAllowed({ headers: { origin: FRONTEND } }, FRONTEND)).toBe(
      true,
    );
  });

  it('allows an Origin whose host matches the request Host', () => {
    const req = { headers: { origin: 'https://box.local', host: 'box.local' } };
    expect(isOriginAllowed(req, FRONTEND)).toBe(true);
  });

  it('rejects a cross-site Origin (CSWSH)', () => {
    const req = {
      headers: { origin: 'https://evil.example', host: 'box.local' },
    };
    expect(isOriginAllowed(req, FRONTEND)).toBe(false);
  });

  it('rejects a malformed Origin', () => {
    expect(
      isOriginAllowed({ headers: { origin: 'not a url' } }, FRONTEND),
    ).toBe(false);
  });
});

describe('authorizeUpgrade', () => {
  const req = { headers: { cookie: 'imb_session=tok' } };

  it('returns the session when validation succeeds', () => {
    const record = {
      token_hash: 'h',
      created_at: 0,
      last_seen: 0,
      expires_at: 1,
    };
    const sessions = { validateFromRequest: jest.fn().mockReturnValue(record) };
    expect(authorizeUpgrade(req, sessions, FRONTEND)).toBe(record);
    expect(sessions.validateFromRequest).toHaveBeenCalledWith(req);
  });

  it('returns null when validation fails (unauthenticated)', () => {
    const sessions = { validateFromRequest: jest.fn().mockReturnValue(null) };
    expect(authorizeUpgrade(req, sessions, FRONTEND)).toBeNull();
  });

  it('returns null (not throw) when the validator throws', () => {
    const sessions = {
      validateFromRequest: jest.fn(() => {
        throw new Error('db down');
      }),
    };
    expect(authorizeUpgrade(req, sessions, FRONTEND)).toBeNull();
  });

  it('returns null on a cross-site Origin without even validating', () => {
    const sessions = { validateFromRequest: jest.fn().mockReturnValue({}) };
    const crossReq = {
      headers: {
        cookie: 'imb_session=tok',
        origin: 'https://evil.example',
        host: 'box.local',
      },
    };
    expect(authorizeUpgrade(crossReq, sessions, FRONTEND)).toBeNull();
    expect(sessions.validateFromRequest).not.toHaveBeenCalled();
  });
});
