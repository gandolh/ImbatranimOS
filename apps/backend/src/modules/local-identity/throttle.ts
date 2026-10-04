/**
 * Failed sign-ins, per client address, with exponential backoff.
 *
 * Five free attempts, then each further failure doubles the wait from one
 * second up to fifteen minutes. A success clears the address. In memory on
 * purpose: a restart forgiving everyone is fine for a single-owner machine,
 * and it keeps an attacker from filling the database.
 */
export class SignInThrottle {
  private readonly failures = new Map<
    string,
    { count: number; until: number }
  >();

  constructor(
    private readonly free = 5,
    private readonly maxWaitMs = 15 * 60_000,
  ) {}

  /** Milliseconds this address must still wait, or 0. */
  waitFor(key: string, now = Date.now()): number {
    const entry = this.failures.get(key);
    return entry ? Math.max(0, entry.until - now) : 0;
  }

  fail(key: string, now = Date.now()): void {
    const count = (this.failures.get(key)?.count ?? 0) + 1;
    const over = count - this.free;
    const wait =
      over > 0 ? Math.min(this.maxWaitMs, 1000 * 2 ** (over - 1)) : 0;
    this.failures.set(key, { count, until: now + wait });
    if (this.failures.size > 10_000) this.failures.clear(); // a flood, not a person
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }
}
