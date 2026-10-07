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
  const live = { subject: 'local-owner', username: 'owner', sid: 'sid_1' };

  it('returns the caller when the session is live', async () => {
    const identity = { authenticate: jest.fn().mockResolvedValue(live) };

    await expect(authorizeUpgrade(req, identity, FRONTEND)).resolves.toBe(live);
    expect(identity.authenticate).toHaveBeenCalledWith('imb_session=tok');
  });

  /**
   * Any failure collapses into `null`, and for a WebSocket that is the right
   * answer: there is no status code to distinguish with, and failing closed is
   * the only safe outcome.
   */
  it('returns null (not throw) when there is no live session', async () => {
    const identity = {
      authenticate: jest.fn(() => Promise.reject(new Error('not active'))),
    };
    await expect(authorizeUpgrade(req, identity, FRONTEND)).resolves.toBeNull();
  });

  it('returns null on a cross-site Origin without even checking the session', async () => {
    const identity = { authenticate: jest.fn() };
    const crossReq = {
      headers: {
        cookie: 'imb_session=tok',
        origin: 'https://evil.example',
        host: 'box.local',
      },
    };

    await expect(
      authorizeUpgrade(crossReq, identity, FRONTEND),
    ).resolves.toBeNull();
    expect(identity.authenticate).not.toHaveBeenCalled();
  });
});
