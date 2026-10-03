import { Injectable } from '@nestjs/common';

/** Ward's access-token lifetime; a cookie older than this is certainly expired. */
export const WARD_ACCESS_TOKEN_TTL_MS = 15 * 60_000;

interface Fresh {
  cookie: string;
  at: number;
}

/**
 * The newest cookie header that authenticated, per Ward session (`sid`).
 *
 * Why it exists (brief 145): a WebSocket keeps the cookie it was opened with,
 * and Ward's access token in that cookie expires after 15 minutes. The
 * terminal's revocation sweep re-checked that one cookie, so every terminal
 * closed as "revoked" 15 minutes after its token was minted, while the user
 * was still signed in and their browser held a fresh token.
 *
 * The REST guard records every cookie that passes, keyed by the session it
 * belongs to. The desktop talks to the API at least once a minute (the tray's
 * poll), so this tracks the browser's rotating token, and the sweep checks a
 * terminal against it. A terminal therefore lives as long as a tab signed into
 * the same Ward session keeps talking to this backend. Revocation, logout and a
 * removed grant still close it, because the sweep still asks Ward; this only
 * chooses which cookie to ask with, and never extends a session.
 *
 * Process-local and in memory: a restart closes every terminal anyway.
 */
@Injectable()
export class WardFreshness {
  private readonly bySid = new Map<string, Fresh>();

  /** Record a cookie header that just authenticated as `sid`. */
  note(
    sid: string | undefined,
    cookie: string | undefined,
    now = Date.now(),
  ): void {
    if (!sid || !cookie) return;
    this.bySid.set(sid, { cookie, at: now });
  }

  /** The newest cookie seen for `sid`, if any. */
  latest(sid: string): string | undefined {
    return this.bySid.get(sid)?.cookie;
  }

  /**
   * Forget sessions nobody needs: older than the token lifetime (so expired
   * anyway) and with no live terminal in `keep`.
   */
  evict(keep: ReadonlySet<string>, now = Date.now()): void {
    for (const [sid, fresh] of this.bySid) {
      if (!keep.has(sid) && now - fresh.at > WARD_ACCESS_TOKEN_TTL_MS) {
        this.bySid.delete(sid);
      }
    }
  }

  /** How many sessions are tracked. For tests and the eviction check. */
  get size(): number {
    return this.bySid.size;
  }
}
