import { MAX_TOKENS, SandboxTokens, TOKEN_IDLE_MS } from './sandbox-tokens';

describe('SandboxTokens (brief 158)', () => {
  it('mints 32 random bytes as base64url, each token different', () => {
    const tokens = new SandboxTokens();
    const a = tokens.mint('x-app', 'b1', 0);
    const b = tokens.mint('x-app', 'b1', 0);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it('looks a token up, and an unknown or malformed one is null', () => {
    const tokens = new SandboxTokens();
    const t = tokens.mint('x-app', 'b1', 1000);
    expect(tokens.lookup(t, 1000)).toMatchObject({
      appId: 'x-app',
      buildId: 'b1',
    });
    expect(tokens.lookup('A'.repeat(43), 1000)).toBeNull();
    expect(tokens.lookup('../../etc', 1000)).toBeNull();
  });

  it('expires a token left unused for six hours, and a lookup keeps it alive', () => {
    const tokens = new SandboxTokens();
    const kept = tokens.mint('x-app', 'b1', 0);
    const idle = tokens.mint('x-app', 'b1', 0);
    // Used just before the deadline: the clock restarts.
    expect(tokens.lookup(kept, TOKEN_IDLE_MS - 1)?.lastUsed).toBe(
      TOKEN_IDLE_MS - 1,
    );
    expect(tokens.lookup(kept, 2 * TOKEN_IDLE_MS - 2)).not.toBeNull();
    expect(tokens.lookup(idle, TOKEN_IDLE_MS + 1)).toBeNull();
    // Gone for good, not just refused once.
    expect(tokens.lookup(idle, 0)).toBeNull();
  });

  it('evicts the least recently used past the cap', () => {
    const tokens = new SandboxTokens();
    const minted = Array.from({ length: MAX_TOKENS }, (_, i) =>
      tokens.mint('x-app', 'b1', i),
    );
    // Using the oldest makes the second oldest the least recently used.
    expect(tokens.lookup(minted[0], 100)).not.toBeNull();
    const extra = tokens.mint('x-app', 'b1', 101);
    expect(tokens.size).toBe(MAX_TOKENS);
    expect(tokens.lookup(minted[1], 102)).toBeNull();
    expect(tokens.lookup(minted[0], 102)).not.toBeNull();
    expect(tokens.lookup(extra, 102)).not.toBeNull();
  });

  it('drops idle tokens before evicting live ones', () => {
    const tokens = new SandboxTokens();
    const live = tokens.mint('x-live', 'b1', TOKEN_IDLE_MS);
    for (let i = 1; i < MAX_TOKENS; i++) tokens.mint('x-idle', 'b1', 0);
    tokens.mint('x-new', 'b1', TOKEN_IDLE_MS + 1);
    expect(tokens.size).toBe(2);
    expect(tokens.lookup(live, TOKEN_IDLE_MS + 1)).not.toBeNull();
  });

  it('revokes one token, or every token of an app', () => {
    const tokens = new SandboxTokens();
    const a1 = tokens.mint('x-a', 'b1', 0);
    const a2 = tokens.mint('x-a', 'b2', 0);
    const b = tokens.mint('x-b', 'b1', 0);
    tokens.revoke(a1);
    expect(tokens.lookup(a1, 0)).toBeNull();
    expect(tokens.lookup(a2, 0)).not.toBeNull();
    tokens.revokeApp('x-a');
    expect(tokens.lookup(a2, 0)).toBeNull();
    expect(tokens.lookup(b, 0)).not.toBeNull();
  });
});
