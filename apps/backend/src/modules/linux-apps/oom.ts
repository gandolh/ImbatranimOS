import { readFileSync, writeFileSync } from "node:fs";

/**
 * Who goes first when the container runs out of memory. On the VPS the
 * whole container is capped (vps-deploy), and the kernel then kills the
 * process with the highest score: every Linux app, and every Terminal shell
 * (so what it starts), is raised to the top, ahead of the backend (0). An
 * unprivileged user may raise a score, never lower one, and children inherit
 * it.
 */
export const LINUX_APP_OOM_SCORE_ADJ = 1000;

/**
 * When a launched app's score is raised again: an app may set its own back
 * while it starts (Firefox's main process does, to 0), and an unprivileged
 * process may lower its score to where it began. Raised again once it is up,
 * it stays.
 */
export const REAPPLY_OOM_SCORE_AFTER_MS = [5_000, 30_000] as const;

/** Raise a process's score; a process already gone is skipped. */
export function raiseOomScore(pid: number, write: (path: string, data: string) => void = writeFileSync): void {
  try {
    write(`/proc/${pid}/oom_score_adj`, String(LINUX_APP_OOM_SCORE_ADJ));
  } catch {
    // Gone already, or no /proc (outside Linux): nothing to raise.
  }
}

/** The `oom_kill` count in a cgroup v2 `memory.events`, or null. */
export function parseOomKills(text: string): number | null {
  const m = /^oom_kill (\d+)$/m.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * The container's out-of-memory kills, from its cgroup's `memory.events`:
 * whether any happened since the last look. Outside a cgroup v2 container
 * it never reports one.
 */
export class OomKills {
  private seen: number | null;

  constructor(private readonly read: () => string = () => readFileSync("/sys/fs/cgroup/memory.events", "utf8")) {
    this.seen = this.count();
  }

  private count(): number | null {
    try {
      return parseOomKills(this.read());
    } catch {
      return null;
    }
  }

  /** True when the kernel killed something for memory since the last call. */
  happened(): boolean {
    const now = this.count();
    if (now === null) return false;
    const more = this.seen !== null && now > this.seen;
    this.seen = now;
    return more;
  }
}
