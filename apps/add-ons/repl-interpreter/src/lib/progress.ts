import type { SystemProgress, SystemProgressState } from "@imbatranim/ui";

/**
 * A program's progress, from ConEmu's `OSC 9;4;<state>;<percent>` (also read by Windows Terminal and Ghostty),
 * for the window's taskbar button. xterm's parser hook reads it; `@xterm/addon-progress` does the same, so no
 * dependency for one OSC with two numbers.
 */

const STATES: Record<string, SystemProgressState> = {
  "0": "none",
  "1": "normal",
  "2": "error",
  "3": "indeterminate",
  "4": "paused",
};

/** The progress an OSC 9 payload (`4;1;40`) reports, or null for any other OSC 9 (an iTerm2 notification). */
export function parseProgress(payload: string): SystemProgress | null {
  const [kind, code, percent] = payload.split(";");
  const state = kind === "4" && code !== undefined ? STATES[code] : undefined;
  if (!state) return null;
  const value = Number(percent);
  if (
    state === "none" ||
    state === "indeterminate" ||
    percent === undefined ||
    percent === "" ||
    !Number.isFinite(value)
  ) {
    return { state };
  }
  return { state, value: Math.min(100, Math.max(0, Math.round(value))) };
}

/** How long a progress state lasts with no update: a killed program never clears its own (Ghostty's 15 s). */
export const PROGRESS_RESET_MS = 15_000;

export type ProgressReporter = {
  /** Takes an OSC 9 payload; true when it was a progress report. */
  report(payload: string): boolean;
  /** Takes the progress off, as the next prompt does. */
  clear(): void;
  dispose(): void;
};

/** Passes progress reports to `show`, and takes them off after {@link PROGRESS_RESET_MS} without an update. */
export function progressReporter(show: (progress: SystemProgress) => void): ProgressReporter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shown = false;
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const clear = () => {
    stop();
    if (!shown) return;
    shown = false;
    show({ state: "none" });
  };
  return {
    report(payload) {
      const progress = parseProgress(payload);
      if (!progress) return false;
      stop();
      if (progress.state === "none") {
        clear();
        return true;
      }
      shown = true;
      show(progress);
      timer = setTimeout(clear, PROGRESS_RESET_MS);
      return true;
    },
    clear,
    dispose: stop,
  };
}
