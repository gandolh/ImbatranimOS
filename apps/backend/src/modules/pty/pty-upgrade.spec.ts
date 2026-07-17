import { isPtyUpgrade, authorizeUpgrade } from './pty-upgrade';
import { PTY_PATH } from './pty.constants';

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
    expect(authorizeUpgrade(req, sessions)).toBe(record);
    expect(sessions.validateFromRequest).toHaveBeenCalledWith(req);
  });

  it('returns null when validation fails (unauthenticated)', () => {
    const sessions = { validateFromRequest: jest.fn().mockReturnValue(null) };
    expect(authorizeUpgrade(req, sessions)).toBeNull();
  });

  it('returns null (not throw) when the validator throws', () => {
    const sessions = {
      validateFromRequest: jest.fn(() => {
        throw new Error('db down');
      }),
    };
    expect(authorizeUpgrade(req, sessions)).toBeNull();
  });
});
