import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

/** A token unused this long is gone: the window that held it is long closed. */
export const TOKEN_IDLE_MS = 6 * 60 * 60_000;
/** The most live at once. Past it the least recently used goes first. */
export const MAX_TOKENS = 64;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export interface SandboxGrant {
  appId: string;
  /** The build the token was minted for. An update moves the app to another, so the token stops working. */
  buildId: string;
  lastUsed: number;
}

/**
 * The capability URLs of sandboxed app windows (brief 158, decision 3).
 *
 * A sandboxed frame has an opaque origin, so it sends no `SameSite=Lax`
 * cookie, and its files cannot be served behind the session. Each window
 * instead gets `marketplace/sandbox/<token>/`, minted by an authenticated
 * request when it opens. The token is 32 random bytes and is the only
 * authentication those routes have, so it is revoked when the window closes,
 * when the app is uninstalled or updated, and after {@link TOKEN_IDLE_MS}
 * unused. It lives in memory: a restart revokes them all, and an open window
 * mints a new one when it reloads.
 *
 * The map's insertion order is its recency order: a lookup moves its token to
 * the end, so the first key is always the least recently used.
 */
@Injectable()
export class SandboxTokens {
  private readonly grants = new Map<string, SandboxGrant>();

  mint(appId: string, buildId: string, now = Date.now()): string {
    this.sweep(now);
    while (this.grants.size >= MAX_TOKENS) {
      const oldest = this.grants.keys().next().value as string;
      this.grants.delete(oldest);
    }
    const token = randomBytes(32).toString('base64url');
    this.grants.set(token, { appId, buildId, lastUsed: now });
    return token;
  }

  /** The grant a token carries, refreshed as used; null when unknown or idle too long. */
  lookup(token: string, now = Date.now()): SandboxGrant | null {
    if (!TOKEN_SHAPE.test(token)) return null;
    const grant = this.grants.get(token);
    if (!grant) return null;
    this.grants.delete(token);
    if (now - grant.lastUsed > TOKEN_IDLE_MS) return null;
    grant.lastUsed = now;
    this.grants.set(token, grant);
    return grant;
  }

  revoke(token: string): void {
    this.grants.delete(token);
  }

  /** Every token of one app: it was uninstalled or updated. */
  revokeApp(appId: string): void {
    for (const [token, grant] of this.grants) {
      if (grant.appId === appId) this.grants.delete(token);
    }
  }

  /** How many are live. For tests. */
  get size(): number {
    return this.grants.size;
  }

  private sweep(now: number): void {
    for (const [token, grant] of this.grants) {
      if (now - grant.lastUsed > TOKEN_IDLE_MS) this.grants.delete(token);
    }
  }
}
