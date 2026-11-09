import { Injectable } from '@nestjs/common';

import type { AppIdentity } from './app-identity.types';

/** A token unused this long has ended; core mints its window a new one when it next calls. */
export const APP_TOKEN_IDLE_MS = 6 * 60 * 60_000;
/** The most live at once. Past it the least recently used goes first. */
export const MAX_APP_TOKENS = 1024;

/** 32 random bytes, as lowercase hex: what core mints. */
export const APP_TOKEN_SHAPE = /^[0-9a-f]{64}$/;

interface Entry {
  readonly identity: AppIdentity;
  /** The session it was minted under; it works under that one only. */
  readonly sid: string;
  lastUsed: number;
}

/** What {@link AppTokens.register} did. */
export type RegisterResult = 'registered' | 'taken';

/**
 * The live app tokens: token → the app, the running copy and the session.
 *
 * Core mints a token per running copy of an app and registers it here with a
 * call made as the user; the handle then sends it with every call. A token
 * dies when its copy closes (core revokes it), with its session (it only
 * resolves under the session it was minted in, and a signed-out session can
 * make no call), after {@link APP_TOKEN_IDLE_MS} unused, or when the map is
 * full and it is the least recently used. It lives in memory: a restart
 * ends them all, and core mints each open window a new one on the refusal.
 *
 * The map's insertion order is its recency order: a lookup moves its token to
 * the end, so the first key is always the least recently used.
 */
@Injectable()
export class AppTokens {
  private readonly entries = new Map<string, Entry>();

  /**
   * Register a token core minted. A copy holds one token per session: a
   * second registration for the same copy replaces the first, which is how a
   * window that lost its token takes a new one. A token already registered is
   * `taken` and changes nothing.
   */
  register(
    token: string,
    sid: string,
    identity: AppIdentity,
    now = Date.now(),
  ): RegisterResult {
    if (!APP_TOKEN_SHAPE.test(token)) {
      throw new Error('An app token is 64 lowercase hex characters');
    }
    if (this.entries.has(token)) return 'taken';
    this.sweep(now);
    this.revokeInstance(sid, identity.instanceId);
    while (this.entries.size >= MAX_APP_TOKENS) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    this.entries.set(token, {
      identity: Object.freeze({
        ...identity,
        groups: Object.freeze([...identity.groups]),
      }),
      sid,
      lastUsed: now,
    });
    return 'registered';
  }

  /**
   * The copy a token names, refreshed as used. Null when the token is
   * malformed, unknown, idle too long, or was minted under another session.
   */
  resolve(token: string, sid: string, now = Date.now()): AppIdentity | null {
    if (!APP_TOKEN_SHAPE.test(token)) return null;
    const entry = this.entries.get(token);
    if (!entry) return null;
    if (now - entry.lastUsed > APP_TOKEN_IDLE_MS) {
      this.entries.delete(token);
      return null;
    }
    if (entry.sid !== sid) return null;
    this.entries.delete(token);
    entry.lastUsed = now;
    this.entries.set(token, entry);
    return entry.identity;
  }

  revoke(token: string): void {
    this.entries.delete(token);
  }

  /** End a running copy's token, as closing it does. */
  revokeInstance(sid: string, instanceId: string): void {
    for (const [token, entry] of this.entries) {
      if (entry.sid === sid && entry.identity.instanceId === instanceId) {
        this.entries.delete(token);
      }
    }
  }

  /** End every copy of one app: it was uninstalled or updated. */
  revokeApp(appId: string): void {
    for (const [token, entry] of this.entries) {
      if (entry.identity.appId === appId) this.entries.delete(token);
    }
  }

  /** The running copies of one session, least recently used first. */
  instances(sid: string, now = Date.now()): AppIdentity[] {
    const live: AppIdentity[] = [];
    for (const entry of this.entries.values()) {
      if (entry.sid === sid && now - entry.lastUsed <= APP_TOKEN_IDLE_MS) {
        live.push(entry.identity);
      }
    }
    return live;
  }

  /** How many are live. For tests. */
  get size(): number {
    return this.entries.size;
  }

  private sweep(now: number): void {
    for (const [token, entry] of this.entries) {
      if (now - entry.lastUsed > APP_TOKEN_IDLE_MS) this.entries.delete(token);
    }
  }
}
