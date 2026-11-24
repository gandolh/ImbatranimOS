import type { IDisposable, Terminal } from "@xterm/xterm";

/**
 * How long the cursor blinks after the last keystroke or focus: GTK's
 * `gtk-cursor-blink-timeout`, whose GNOME default is 10 s, reset by each
 * interaction.
 */
export const BLINK_TIMEOUT_MS = 10_000;

/** The parts of a terminal this needs, so a test can hand in a stand-in. */
type BlinkingTerminal = Pick<Terminal, "options" | "onData" | "textarea">;

type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

/**
 * The cursor blinks while someone is at the terminal and holds still after
 * {@link BLINK_TIMEOUT_MS} without typing, the way GTK and GNOME's terminals
 * do. xterm's DOM renderer blinks with an endless CSS animation of the
 * cursor's colours, which the browser can't hand to the compositor: a focused
 * Terminal left alone restyled itself every frame, about 2.3% of a core
 * (measured 2026-11-23). Typing, a paste, a mouse report or focusing the
 * terminal starts the blink again.
 *
 * One timer at a time: a keystroke only records when it happened, and the
 * timer, when it fires early, waits out the rest.
 */
export function blinkWhileActive(
  term: BlinkingTerminal,
  timeoutMs = BLINK_TIMEOUT_MS,
  clock: Clock = realClock,
): IDisposable {
  let last = clock.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const settle = () => {
    timer = undefined;
    const idle = clock.now() - last;
    if (idle < timeoutMs) {
      timer = clock.setTimeout(settle, timeoutMs - idle);
      return;
    }
    term.options.cursorBlink = false;
  };

  const wake = () => {
    last = clock.now();
    if (!term.options.cursorBlink) term.options.cursorBlink = true;
    timer ??= clock.setTimeout(settle, timeoutMs);
  };

  wake();
  const data = term.onData(wake);
  const textarea = term.textarea;
  textarea?.addEventListener("focus", wake);

  return {
    dispose() {
      data.dispose();
      textarea?.removeEventListener("focus", wake);
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
    },
  };
}
