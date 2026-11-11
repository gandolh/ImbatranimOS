import { Injectable } from "@nestjs/common";
import { readFileSync } from "fs";

/** What `/proc/<pid>/stat` says about a process's groups. */
export interface ProcGroups {
  pgrp: number;
  session: number;
  /** Its controlling terminal; 0 for none. */
  tty: number;
}

/** Parse `/proc/<pid>/stat`. The command name may hold spaces and parentheses. */
export function parseStat(stat: string): ProcGroups | null {
  const end = stat.lastIndexOf(")");
  if (end < 0) return null;
  const fields = stat.slice(end + 2).split(" ");
  // state ppid pgrp session tty_nr ...
  const pgrp = Number(fields[2]);
  const session = Number(fields[3]);
  const tty = Number(fields[4]);
  if (![pgrp, session, tty].every(Number.isInteger)) return null;
  return { pgrp, session, tty };
}

export function procGroups(pid: number): ProcGroups | null {
  try {
    return parseStat(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The process groups a session's apps run in, which the session's end stops
 * and the cover screen freezes. Apps started from Start are each in a group
 * of their own (recorded when launched). Apps started from a Terminal are
 * found through the session socket's clients (the host reads each one's pid
 * with `SO_PEERCRED`): their group, unless that is a Terminal shell's own
 * (a session leader with a terminal, which an app started without job
 * control shares) or the backend's.
 */
export function clientGroups(pids: readonly number[], own: number | null = ownGroup()): number[] {
  const out = new Set<number>();
  for (const pid of pids) {
    const g = procGroups(pid);
    if (!g || g.pgrp <= 1 || g.pgrp === own) continue;
    if (g.pgrp === g.session && g.tty !== 0) continue;
    out.add(g.pgrp);
  }
  return [...out];
}

let cachedOwnGroup: number | null | undefined;
export function ownGroup(): number | null {
  if (cachedOwnGroup === undefined) cachedOwnGroup = procGroups(process.pid)?.pgrp ?? null;
  return cachedOwnGroup;
}

/** Signal each group; a group already gone is skipped. Returns the groups signalled. */
export function signalGroups(groups: readonly number[], signal: NodeJS.Signals): number[] {
  const done: number[] = [];
  for (const g of groups) {
    if (g <= 1) continue;
    try {
      process.kill(-g, signal);
      done.push(g);
    } catch {
      // Gone, or not ours.
    }
  }
  return done;
}

/** Groups with a process still in them. */
export function liveGroups(groups: readonly number[]): number[] {
  return groups.filter((g) => {
    try {
      process.kill(-g, 0);
      return true;
    } catch {
      return false;
    }
  });
}

/** Apps started from Start, by desktop session. */
@Injectable()
export class SessionApps {
  private readonly launched = new Map<string, Set<number>>();

  record(session: string, group: number): void {
    const set = this.launched.get(session) ?? new Set<number>();
    set.add(group);
    this.launched.set(session, set);
  }

  /** The group's leader exited; its group may still hold children. */
  exited(session: string, group: number): void {
    if (liveGroups([group]).length === 0) this.launched.get(session)?.delete(group);
  }

  groups(session: string): number[] {
    return [...(this.launched.get(session) ?? [])];
  }

  forget(session: string): void {
    this.launched.delete(session);
  }
}
