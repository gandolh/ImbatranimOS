import { isPtyUpgrade, authorizeUpgrade, isOriginAllowed } from './pty-upgrade';
import { PTY_PATH } from './pty.constants';
import { IMBATRANIMOS_APP_SLUG } from '../ward/ward.types';

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
  const req = { headers: { cookie: 'ward_session=tok' } };

  const session = (grants: Record<string, string[]>) => ({
    active: true as const,
    subject: 'subject_owner',
    username: 'owner',
    grants,
    sid: 'sid_1',
  });

  it('returns the session when it is live and holds a grant for this app', async () => {
    const live = session({ [IMBATRANIMOS_APP_SLUG]: ['owner'] });
    const ward = { authenticate: jest.fn().mockResolvedValue(live) };

    await expect(authorizeUpgrade(req, ward, FRONTEND)).resolves.toBe(live);
    expect(ward.authenticate).toHaveBeenCalledWith('ward_session=tok');
  });

  /**
   * The assertion that matters most in this file.
   *
   * prm's registration is open to the public, so a live Ward session held by a
   * complete stranger is an ordinary thing to receive here. Authenticating
   * without checking the grant would hand that stranger a shell on the machine.
   */
  it('returns null for a live session that holds no grant for this app', async () => {
    const ward = {
      authenticate: jest.fn().mockResolvedValue(session({ prm: ['user'] })),
    };
    await expect(authorizeUpgrade(req, ward, FRONTEND)).resolves.toBeNull();
  });

  it('returns null when there is no live session', async () => {
    const ward = {
      authenticate: jest.fn().mockRejectedValue(new Error('not active')),
    };
    await expect(authorizeUpgrade(req, ward, FRONTEND)).resolves.toBeNull();
  });

  /**
   * Ward being unreachable collapses into the same `null`, and for a WebSocket
   * that is the right answer: there is no status code to distinguish with, and
   * failing closed is the only safe outcome.
   */
  it('returns null (not throw) when Ward cannot be reached', async () => {
    const ward = {
      authenticate: jest.fn(() => Promise.reject(new Error('ward is down'))),
    };
    await expect(authorizeUpgrade(req, ward, FRONTEND)).resolves.toBeNull();
  });

  it('returns null on a cross-site Origin without even asking Ward', async () => {
    const ward = { authenticate: jest.fn() };
    const crossReq = {
      headers: {
        cookie: 'ward_session=tok',
        origin: 'https://evil.example',
        host: 'box.local',
      },
    };

    await expect(
      authorizeUpgrade(crossReq, ward, FRONTEND),
    ).resolves.toBeNull();
    expect(ward.authenticate).not.toHaveBeenCalled();
  });
});
