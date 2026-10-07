import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { basename } from 'path';

import type { AppManifest } from './app-manifest';
import type { AppSource } from './source-url';

/** How long a checked app waits for the owner's Install or Cancel. */
export const PENDING_TTL_MS = 15 * 60_000;
/** The most waiting at once, checks still running included. Each holds a clone of up to 512 MB. */
export const MAX_PENDING = 4;
const SWEEP_MS = 60_000;

export interface PendingInspection {
  /** The derived `x-…` id. */
  id: string;
  buildId: string;
  /** The clone, `apps/<id>@<buildId>`. Installing keeps it; anything else deletes it. */
  dir: string;
  /** The app's directory inside the clone, POSIX, '' for the top. */
  root: string;
  /** The manifest's entry, normalized, relative to `root`. */
  entry: string;
  manifest: AppManifest;
  source: AppSource;
  expiresAt: number;
}

/**
 * Apps checked from a URL and waiting for the owner's consent (brief 158).
 *
 * A check clones the repository, so its directory has to outlive the request
 * that made it, until Install keeps it or Cancel, a second check's install or
 * {@link PENDING_TTL_MS} deletes it. They live in memory: after a restart the
 * boot sweep (`MarketplaceService.sweepStaleBuilds`) deletes the directories,
 * since no database row names them, and nothing can be pending at boot.
 *
 * Directories being cloned or held here are never deleted by an install's or
 * an uninstall's clean-up of the app's other builds: see {@link holds}.
 */
@Injectable()
export class PendingInspections implements OnModuleInit, OnModuleDestroy {
  private readonly entries = new Map<string, PendingInspection>();
  /** Checks accepted and still running: they count against {@link MAX_PENDING}. */
  private running = 0;
  /** Directory names (`<id>@<buildId>`) being cloned right now. */
  private readonly cloning = new Set<string>();
  private sweepTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.sweepTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    // What is left would be swept at the next boot anyway; doing it now keeps
    // a test's directory clean.
    for (const pending of [...this.entries.keys()]) await this.cancel(pending);
  }

  /**
   * Claim a slot for a check about to run, or refuse when {@link MAX_PENDING}
   * are waiting or running. The returned function gives the slot back; it is
   * safe to call twice.
   */
  reserve(now = Date.now()): () => void {
    void this.sweep(now);
    if (this.entries.size + this.running >= MAX_PENDING) {
      throw new HttpException(
        `${MAX_PENDING} checked apps are already waiting for Install or Cancel. Answer one of them first.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.running += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running -= 1;
    };
  }

  /** Mark a clone directory as being written, so no clean-up deletes it mid-fetch. */
  startCloning(dir: string): void {
    this.cloning.add(basename(dir));
  }

  stopCloning(dir: string): void {
    this.cloning.delete(basename(dir));
  }

  add(entry: Omit<PendingInspection, 'expiresAt'>, now = Date.now()): string {
    const pending = randomBytes(16).toString('hex');
    this.entries.set(pending, { ...entry, expiresAt: now + PENDING_TTL_MS });
    return pending;
  }

  /** A live pending check, or null when unknown or expired. */
  get(pending: string, now = Date.now()): PendingInspection | null {
    const entry = this.entries.get(pending);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      void this.cancel(pending);
      return null;
    }
    return entry;
  }

  /** Forget a pending check but keep its directory: it is being installed. */
  take(pending: string): void {
    this.entries.delete(pending);
  }

  /** Forget a pending check and delete its clone. Unknown is not an error. */
  async cancel(pending: string): Promise<void> {
    const entry = this.entries.get(pending);
    if (!entry) return;
    this.entries.delete(pending);
    await fs.rm(entry.dir, { recursive: true, force: true });
  }

  /**
   * True when a directory name (`<id>@<buildId>`) belongs to a check still
   * cloning or waiting. An install's or uninstall's clean-up of `<id>@*`
   * leaves it: deleting it would pull the files from under a consent card
   * that is still open.
   */
  holds(name: string): boolean {
    if (this.cloning.has(name)) return true;
    for (const entry of this.entries.values()) {
      if (basename(entry.dir) === name) return true;
    }
    return false;
  }

  /**
   * Delete every check past its time. Runs every minute; tests call it with a
   * later `now`. The entries go at once (before the first await), so a
   * caller that does not wait still sees them gone.
   */
  async sweep(now = Date.now()): Promise<void> {
    const expired: string[] = [];
    for (const [pending, entry] of this.entries) {
      if (entry.expiresAt > now) continue;
      this.entries.delete(pending);
      expired.push(entry.dir);
    }
    for (const dir of expired) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  /** How many are waiting. For tests. */
  get size(): number {
    return this.entries.size;
  }
}
