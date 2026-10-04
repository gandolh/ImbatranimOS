import { SignInThrottle } from './throttle';

describe('SignInThrottle', () => {
  it('lets five misses through, then doubles the wait from one second', () => {
    const t = new SignInThrottle();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) t.fail('ip', now);
    expect(t.waitFor('ip', now)).toBe(0);
    t.fail('ip', now);
    expect(t.waitFor('ip', now)).toBe(1000);
    t.fail('ip', now);
    expect(t.waitFor('ip', now)).toBe(2000);
  });

  it('caps the wait, keeps addresses apart, and forgets on success', () => {
    const t = new SignInThrottle(0, 5000);
    for (let i = 0; i < 20; i++) t.fail('a', 0);
    expect(t.waitFor('a', 0)).toBe(5000);
    expect(t.waitFor('b', 0)).toBe(0);
    t.succeed('a');
    expect(t.waitFor('a', 0)).toBe(0);
  });
});
