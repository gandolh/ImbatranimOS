import type { CommandSource, SystemNotifyInput } from "@imbatranim/ui";

/**
 * A long command's end, said in a toast when its window isn't the focused one (Ghostty's
 * notify-on-command-finish, 2026-11-20). The threshold and the wording are the defaults the owner may
 * change.
 */

/** How long a command runs before its end is worth a toast. */
export const LONG_COMMAND_MS = 10_000;

const STORAGE_KEY = "imbatranim:terminal:notify-long-commands";

/** Whether long commands' ends are said in a toast: on unless switched off. */
export function loadNotifyLong(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveNotifyLong(on: boolean): void {
  try {
    if (on) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    /* private mode: the switch lasts this page's life */
  }
}

/** A duration as people say it: "12 s", "2 min 14 s", "1 h 3 min". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

export type FinishedCommand = {
  startedAt: number;
  endedAt: number;
  /** The exit code, null when the shell didn't say. */
  exit: number | null;
  /** The window's title while the command ran: the directory, or what the program set. */
  title: string;
  /** Whether the window was the focused one when the command ended. */
  focused: boolean;
  /** The switch. */
  enabled: boolean;
  /** The window to bring back with Show. */
  windowId: string | null;
};

/** The toast for a finished command, or null when it gets none. */
export function finishedToast(c: FinishedCommand): SystemNotifyInput | null {
  if (!c.enabled || c.focused || c.endedAt - c.startedAt < LONG_COMMAND_MS) return null;
  const failed = c.exit !== null && c.exit !== 0;
  return {
    title: failed ? `Command failed, exit ${c.exit}` : "Command finished",
    body: `${formatDuration(c.endedAt - c.startedAt)} in ${c.title}`,
    level: failed ? "warning" : "info",
    ...(c.windowId ? { actions: [{ label: "Show", payload: { showWindow: c.windowId } }] } : {}),
  };
}

const SWITCH_ID = "terminal:notify-long-commands";
const SWITCH_WORDS = "terminal notify notification toast long command finishes finished";

/**
 * The switch, in the command palette and Start's search: the Terminal has no menu. The label says what it
 * is now; picking it turns it the other way.
 */
export const notifySwitchSource: CommandSource = {
  group: "Terminal",
  search(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0 || !words.every((w) => SWITCH_WORDS.includes(w))) return Promise.resolve([]);
    const on = loadNotifyLong();
    return Promise.resolve([
      {
        id: SWITCH_ID,
        group: "Terminal",
        label: `Notify when a long command finishes: ${on ? "on" : "off"}`,
        subtitle: on ? "Turn it off" : "Turn it on",
      },
    ]);
  },
  activate(item) {
    if (item.id === SWITCH_ID) saveNotifyLong(!loadNotifyLong());
  },
};
