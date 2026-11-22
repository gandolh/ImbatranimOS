import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal as XTerm, type IBufferRange, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, Plug, RotateCw, Search, X } from "lucide-react";
import { Button, useConfirm, useSystem, useSystemAppearance } from "@imbatranim/ui";
import { usePtyConnection, type ShellTokenKeep } from "./hooks/usePtyConnection";
import { startFolderFrom } from "./ptyUrl";
import { safePaste } from "./lib/paste";
import { linkAction } from "./lib/links";
import { applyMark, cwdFromOsc7, INITIAL_SHELL_STATE, windowTitle, type ShellState } from "./lib/shellState";
import { finishedToast, loadNotifyLong } from "./lib/commandNotify";
import { arrowKeys, arrowsTo, type Cell } from "./lib/promptCursor";
import { progressReporter } from "./lib/progress";
import { buildXtermTheme, documentVarResolver } from "./lib/xtermTheme";
import {
  DEFAULT_FONT_SIZE,
  loadFontSize,
  saveFontSize,
  stepFontSize,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from "./lib/fontSize";

/** The cells a link covers, as text: an OSC 8 link's visible words. `range` is 1-based, as xterm gives it. */
function textInRange(term: XTerm, range: IBufferRange): string {
  const buffer = term.buffer.active;
  let text = "";
  for (let y = range.start.y; y <= range.end.y; y++) {
    const line = buffer.getLine(y - 1);
    if (!line) continue;
    const from = y === range.start.y ? range.start.x - 1 : 0;
    const to = y === range.end.y ? range.end.x : undefined;
    text += line.translateToString(true, from, to);
  }
  return text;
}

/** Cap scrollback so a long-running flood can't grow xterm's buffer unbounded. */
const SCROLLBACK = 5000;

const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Code", "Roboto Mono", monospace';

/**
 * A real login shell in a window, over an authenticated WebSocket to the PTY
 * gateway (`/api/pty`). Each mounted instance is its own xterm + its own socket +
 * its own shell process — open two windows, get two shells. Closing the window
 * unmounts this component, which closes the socket, which reaps the pty
 * server-side.
 *
 * The socket lifecycle — including reconnect with backoff — lives in
 * `usePtyConnection`. This component owns the xterm instance, the theme, the
 * addons, and the chrome.
 */
// `windowId` is part of the add-on contract (every app receives it) but this one no
// longer needs it: the xterm instance is created by a ref callback keyed on the host
// element, so "one terminal per window" falls out of mounting rather than from an
// effect keyed on the id.
export function Terminal(_props: { windowId: string }) {
  /**
   * The xterm instance lives in a ref, not in state, and is built by a **ref
   * callback** on the host element.
   *
   * Two reasons, both load-bearing. First, xterm's API is mutation — `term.options
   * .theme = …`, `term.options.fontSize = …` — and React's immutability rule
   * (rightly) refuses to let you mutate a value that came out of `useState`.
   * Second, a ref callback runs whenever the node attaches, so there is no window
   * where the effect has run but the host div does not exist yet.
   *
   * `generation` is the render signal: bumped once the instance exists, so the
   * effects and the connection hook below can depend on "there is a terminal now"
   * without the instance itself being render data.
   */
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [generation, setGeneration] = useState(0);
  /** Stable reader for the instance — never a render-time ref access. */
  const getTerm = useCallback(() => termRef.current, []);

  const [fontSize, setFontSize] = useState(loadFontSize);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const system = useSystem();

  /**
   * Opens a link the output carries, by `lib/links.ts`'s rule: http and https
   * open in a new tab, anything else is refused with a toast. Held in a ref so
   * the handlers given to xterm at construction always call the current one.
   */
  const openLinkRef = useRef<(uri: string, shownText?: string) => void>(() => undefined);
  /** An OSC 8 link's target, shown at the pointer while it is hovered. */
  const [linkTip, setLinkTip] = useState<{ url: string; left: number; top: number } | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  /**
   * What this window knows of its shell, from the marks the image's bash integration prints (`lib/shellState.ts`),
   * and an xterm marker at each prompt's start. Refs, not state: nothing renders from them yet, and the pane's
   * `data-shell-*` attributes show them for a look in the inspector.
   */
  const shellRef = useRef<ShellState>(INITIAL_SHELL_STATE);
  const promptMarksRef = useRef<IMarker[]>([]);
  /** Where typing starts in the current command: a marker on the B mark's row, and its column. */
  const inputStartRef = useRef<{ marker: IMarker; col: number } | null>(null);
  /** Where the pointer went down, to tell a click from a drag that selects. */
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  /** The title this window last took from its shell: where a finished command ran, for its toast. */
  const titleRef = useRef("Terminal");

  // Subscribed, not read once at mount: changing the theme or accent in Settings
  // has to restyle an already-open terminal, which the old read-at-mount accent
  // could not do.
  const { theme, accent } = useSystemAppearance();

  /** Re-fit and tell the pty, so SIGWINCH matches what xterm now shows. */
  const refit = useCallback((send?: (cols: number, rows: number) => void, t?: XTerm | null) => {
    try {
      fitRef.current?.fit();
    } catch {
      /* container may be mid-layout or zero-sized */
    }
    const inst = t ?? null;
    if (inst && send) send(inst.cols, inst.rows);
  }, []);

  // The hook sends its own initial resize on every (re)connect, so there is no
  // `onOpen` callback to thread back in — which also removes the cycle an earlier
  // draft had, where `onOpen` needed the `sendResize` produced by the same call.
  //
  // The window keeps its shell's token, so a reload comes back to the same shell.
  // Read through `system.window` at connect time; both members are optional.
  const keep = useMemo<ShellTokenKeep>(
    () => ({
      saved: () => system.window.savedState?.() ?? null,
      save: (token) => system.window.saveState?.(token),
    }),
    [system],
  );
  // The folder the launch named (Files' Open in Terminal, or another Terminal's
  // New window). Read once: the payload is the launch's, and a reload comes
  // back to the shell, which is wherever it went since.
  const [start] = useState(() => startFolderFrom(system.intents.consume()));
  const { status, sendInput, sendResize, sendClose, reconnect } = usePtyConnection({
    getTerm,
    generation,
    keep,
    start,
  });

  const attachHost = useCallback((host: HTMLDivElement | null) => {
    hostRef.current = host;
    if (!host) return;

    const instance = new XTerm({
      scrollback: SCROLLBACK,
      // Required by the Unicode11 addon below: xterm gates
      // `term.unicode` — the only way to swap the width table — behind this
      // flag. Narrow and deliberate: it is the one proposed API this app
      // touches, and without it the addon throws on activate and the whole
      // terminal lands in the error boundary.
      allowProposedApi: true,
      cursorBlink: true,
      fontSize: loadFontSize(),
      fontFamily: FONT_FAMILY,
      theme: buildXtermTheme(
        document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
        documentVarResolver(),
      ),
      /**
       * OSC 8 hyperlinks, where a program names the target and the text can say
       * anything. Without a handler xterm asks with the native `confirm()` and
       * then sets `location.href` to any scheme. Every scheme reaches `activate`
       * here (`allowNonHttpProtocols`) so a refused one says why instead of
       * doing nothing; the target shows at the pointer before the click.
       */
      linkHandler: {
        allowNonHttpProtocols: true,
        activate: (_event, uri, range) => openLinkRef.current(uri, textInRange(instance, range)),
        hover: (event, uri) => {
          const pane = paneRef.current?.getBoundingClientRect();
          if (!pane) return;
          setLinkTip({ url: uri, left: event.clientX - pane.left + 12, top: event.clientY - pane.top + 16 });
        },
        leave: () => setLinkTip(null),
      },
    });
    const fit = new FitAddon();
    instance.loadAddon(fit);
    fitRef.current = fit;
    const search = new SearchAddon();
    instance.loadAddon(search);
    searchRef.current = search;
    /**
     * Unicode 11 cell widths.
     *
     * xterm ships a Unicode *6* width table by default, which predates emoji
     * being double-width and gets a lot of CJK wrong. The visible symptom is
     * not "the emoji looks odd": every character after a mis-measured one is
     * drawn a column off, so `ls` of a directory with an emoji in one filename
     * corrupts the whole grid — and the shell's own cursor arithmetic, which
     * assumes the terminal agrees with it, then eats characters while you edit
     * a command line. Same sanctioned @xterm/addon-* family as fit, search and
     * web-links; `activeVersion` is what actually swaps the table in.
     */
    instance.loadAddon(new Unicode11Addon());
    instance.unicode.activeVersion = "11";
    // Makes plain URLs in output clickable, through the same rule as OSC 8 links.
    instance.loadAddon(new WebLinksAddon((_, uri) => openLinkRef.current(uri)));
    instance.open(host);

    // Fit before the socket opens so the pty spawns at the right geometry.
    try {
      fit.fit();
    } catch {
      /* container may not be laid out yet on first paint */
    }

    termRef.current = instance;
    setGeneration((g) => g + 1);

    return () => {
      fitRef.current = null;
      searchRef.current = null;
      termRef.current = null;
      instance.dispose();
    };
  }, []);

  // ── The shell's marks (OSC 133) and working directory (OSC 7) ─────────────
  useEffect(() => {
    const instance = termRef.current;
    if (!instance) return;
    const show = () => {
      const pane = paneRef.current;
      if (!pane) return;
      const state = shellRef.current;
      pane.dataset.shellPhase = state.phase;
      pane.dataset.shellExit = state.lastExit === null ? "" : String(state.lastExit);
      pane.dataset.shellCwd = state.cwd ?? "";
    };
    // A program's progress (OSC 9;4) on the taskbar button, off after 15 s with
    // no update or at the next prompt.
    const progress = progressReporter((p) => system.window.setProgress?.(p));
    const progressOsc = instance.parser.registerOscHandler(9, (payload) => progress.report(payload));
    const marks = instance.parser.registerOscHandler(133, (payload) => {
      if (payload === "A") progress.clear();
      const before = shellRef.current;
      const now = Date.now();
      shellRef.current = applyMark(before, payload, now);
      // A command ended: a long one, in a window that isn't focused, says so in a toast.
      if (before.phase === "running" && shellRef.current.phase === "prompt" && before.startedAt !== null) {
        const toast = finishedToast({
          startedAt: before.startedAt,
          endedAt: now,
          exit: shellRef.current.lastExit,
          title: titleRef.current,
          focused: system.window.isFocused(),
          enabled: loadNotifyLong(),
          windowId: system.windowId,
        });
        if (toast) system.notify(toast);
      }
      if (payload === "B") {
        inputStartRef.current?.marker.dispose();
        const marker = instance.registerMarker(0);
        inputStartRef.current = marker ? { marker, col: instance.buffer.active.cursorX } : null;
      }
      if (payload === "A") {
        const marker = instance.registerMarker(0);
        // A marker trimmed off the scrollback is disposed; drop those as new ones come.
        promptMarksRef.current = promptMarksRef.current.filter((m) => !m.isDisposed);
        if (marker) promptMarksRef.current.push(marker);
      }
      show();
      return true;
    });
    const cwd = instance.parser.registerOscHandler(7, (payload) => {
      const path = cwdFromOsc7(payload);
      if (path !== null) shellRef.current = { ...shellRef.current, cwd: path };
      show();
      return true;
    });
    // A bell while the window isn't the focused one asks for attention, silently.
    const bell = instance.onBell(() => {
      if (!system.window.isFocused()) system.window.requestAttention?.();
    });
    return () => {
      marks.dispose();
      cwd.dispose();
      progressOsc.dispose();
      progress.dispose();
      bell.dispose();
    };
  }, [generation, system]);

  // ── Titles (OSC 0 and 2) → the window and the taskbar ─────────────────────
  useEffect(() => {
    const instance = termRef.current;
    if (!instance) return;
    const sub = instance.onTitleChange((title) => {
      titleRef.current = windowTitle(title);
      system.window.setTitle(titleRef.current);
    });
    return () => sub.dispose();
  }, [generation, system]);

  // ── Input → socket ────────────────────────────────────────────────────────
  useEffect(() => {
    const instance = termRef.current;
    if (!instance) return;
    const sub = instance.onData(sendInput);
    return () => sub.dispose();
  }, [generation, sendInput]);

  // ── Resize → fit → SIGWINCH ───────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    const instance = termRef.current;
    if (!host || !instance) return;
    const ro = new ResizeObserver(() => refit(sendResize, instance));
    ro.observe(host);
    return () => ro.disconnect();
  }, [generation, sendResize, refit]);

  // ── Theme / accent changes restyle the live terminal ──────────────────────
  useEffect(() => {
    const instance = termRef.current;
    if (!instance) return;
    // Read AFTER the appearance store has pushed `data-theme` and `--accent` onto
    // the root. `applyAppearance` runs in an effect in App.tsx, and effects run
    // parent-first, so by the time this child effect fires the vars are current.
    instance.options.theme = buildXtermTheme(theme === "light" ? "light" : "dark", documentVarResolver());
    // `accent` is in the deps because it changes `--accent`, which the resolver
    // reads — the value itself is not referenced here.
  }, [generation, theme, accent]);

  // ── Font size ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const instance = termRef.current;
    if (!instance) return;
    instance.options.fontSize = fontSize;
    saveFontSize(fontSize);
    refit(sendResize, instance);
  }, [generation, fontSize, sendResize, refit]);

  const zoom = useCallback((direction: 1 | -1 | 0) => {
    setFontSize((prev) => stepFontSize(prev, direction));
  }, []);

  // ── Clipboard ─────────────────────────────────────────────────────────────

  const { confirm, confirmDialog } = useConfirm();

  // Closing the window ends the shell at once, after a question while a
  // command runs (at a prompt, or with no shell marks, it closes straight
  // away). Every other end of the socket (a reload, a drop) leaves the shell
  // waiting 30 s for this window to come back.
  useEffect(
    () =>
      system.window.onCloseRequest(async () => {
        if (shellRef.current.phase === "running") {
          const ok = await confirm({
            title: "Close the Terminal anyway?",
            message: "A command is still running.",
            confirmLabel: "Close",
            cancelLabel: "Cancel",
            destructive: true,
          });
          if (!ok) return false;
        }
        sendClose();
        return true;
      }),
    [system, sendClose, confirm],
  );

  /**
   * Every paste lands here: the keyboard's paste event, the right-click and
   * middle-click paste, a text drop. Text that could run a command as it
   * arrives asks first, control bytes become spaces, and xterm's own `paste()`
   * converts newlines and brackets the text when the shell asked for it
   * (`lib/paste.ts`). Never `sendInput`: that skips all three.
   */
  const pasteText = useCallback(
    async (text: string) => {
      const instance = termRef.current;
      if (!instance) return;
      await safePaste(instance, text, (preview) =>
        confirm({
          title: "Paste into the terminal?",
          message: (
            <>
              <span>This text has a line break or a control sequence, so it may run a command as it arrives.</span>
              <pre className="rounded-control bg-surface-container-lowest text-on-surface text-label mt-2 max-h-40 overflow-auto p-2 font-mono whitespace-pre-wrap">
                {preview}
              </pre>
            </>
          ),
          confirmLabel: "Paste",
          cancelLabel: "Cancel",
        }),
      );
      instance.focus();
    },
    [confirm],
  );

  /**
   * Paste through the async Clipboard API.
   *
   * Reported rather than silent on rejection: `readText()` throws when the
   * permission is denied or the document is not focused, and a paste that does
   * nothing with no explanation is indistinguishable from a broken terminal.
   */
  const paste = useCallback(async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      system.notify({
        title: "Paste blocked",
        body: "The browser would not grant clipboard access. Use the keyboard shortcut for your platform, or allow clipboard permission for this site.",
        level: "warning",
      });
      return;
    }
    await pasteText(text);
  }, [pasteText, system]);

  /**
   * The keyboard paste, taken before xterm sees it. The browser delivers it as a
   * `paste` event on xterm's helper textarea, and xterm writes that text to the
   * pty as it is. Listening in the capture phase on the host, and stopping the
   * event there, lets the text go through `pasteText` instead, and once. A text
   * dropped on the terminal goes the same way; a file drop is left alone.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void pasteText(e.clipboardData?.getData("text/plain") ?? "");
    };
    const isTextDrag = (e: DragEvent) =>
      !!e.dataTransfer && e.dataTransfer.types.includes("text/plain") && !e.dataTransfer.types.includes("Files");
    const onDragOver = (e: DragEvent) => {
      if (isTextDrag(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!isTextDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      void pasteText(e.dataTransfer?.getData("text/plain") ?? "");
    };
    host.addEventListener("paste", onPaste, { capture: true });
    host.addEventListener("dragover", onDragOver);
    host.addEventListener("drop", onDrop, { capture: true });
    return () => {
      host.removeEventListener("paste", onPaste, { capture: true });
      host.removeEventListener("dragover", onDragOver);
      host.removeEventListener("drop", onDrop, { capture: true });
    };
  }, [generation, pasteText]);

  /**
   * The link rule in action. Explicit noopener/noreferrer: output can contain
   * any URL, including one a remote command printed, and a terminal must not
   * hand it a window handle. On a screen with no hover the target wasn't shown
   * before the tap, so an OSC 8 link whose text isn't its address asks first.
   */
  const openLink = useCallback(
    async (uri: string, shownText?: string) => {
      const canHover = window.matchMedia?.("(hover: hover)").matches ?? true;
      const action = linkAction(uri, shownText === undefined ? { canHover } : { shownText, canHover });
      if (action.kind === "refuse") {
        system.notify({ title: "The Terminal opens only web links", level: "warning" });
        return;
      }
      if (action.kind === "ask") {
        const ok = await confirm({
          title: `Open a link to ${action.host}?`,
          message: (
            <>
              The link&apos;s text is not its address. It goes to{" "}
              <span className="font-mono break-all">{action.href}</span>.
            </>
          ),
          confirmLabel: "Open",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
      }
      window.open(action.href, "_blank", "noopener,noreferrer");
    },
    [confirm, system],
  );
  useEffect(() => {
    openLinkRef.current = (uri, shownText) => void openLink(uri, shownText);
  }, [openLink]);

  const copy = useCallback(async () => {
    const selection = termRef.current?.getSelection();
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
    } catch {
      system.notify({
        title: "Copy blocked",
        body: "The browser would not grant clipboard access.",
        level: "warning",
      });
    }
  }, [system]);

  /**
   * Opens another Terminal in this one's folder: the shell's (from OSC 7), else
   * the folder this window was opened in, else the home folder.
   */
  const openHere = useCallback(() => {
    const cwd = shellRef.current.cwd;
    const folder = cwd ? { cwd } : start;
    system.intents.openApp("terminal", folder ?? undefined);
  }, [system, start]);

  /**
   * Scrolls to the previous (-1) or next (1) prompt, from the markers the
   * shell's A marks left. Past the last prompt, down goes to the bottom.
   */
  const jumpToPrompt = useCallback((direction: -1 | 1) => {
    const instance = termRef.current;
    if (!instance) return;
    const top = instance.buffer.active.viewportY;
    const lines = promptMarksRef.current.filter((m) => !m.isDisposed).map((m) => m.line);
    const target = direction < 0 ? lines.filter((l) => l < top).at(-1) : lines.find((l) => l > top);
    if (target !== undefined) instance.scrollToLine(target);
    else if (direction > 0) instance.scrollToBottom();
  }, []);

  /**
   * Terminal-wide key handling, registered with xterm rather than on the DOM.
   *
   * `attachCustomKeyEventHandler` returning false stops xterm from also treating
   * the event as input — without it, Ctrl+Shift+V would paste *and* send a stray
   * control character to the shell.
   *
   * Ctrl+C and Ctrl+V are deliberately untouched: they must keep meaning SIGINT
   * and a literal byte. That is exactly why the Shift variants are the terminal
   * convention.
   */
  useEffect(() => {
    const instance = termRef.current;
    if (!instance) return;
    instance.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      // Ctrl+Shift+N (and Alt+Shift+N, which a browser tab lets through): a new
      // Terminal in this one's folder.
      if (e.shiftKey && e.key.toLowerCase() === "n" && ((e.ctrlKey && !e.altKey) || (e.altKey && !e.ctrlKey))) {
        e.preventDefault();
        openHere();
        return false;
      }
      // Ctrl+Shift+Up and Down: the previous and next prompt (readline binds neither).
      if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        jumpToPrompt(e.key === "ArrowUp" ? -1 : 1);
        return false;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey) {
        const key = e.key.toLowerCase();
        // NOTE: 'v' is deliberately NOT handled here.
        //
        // Measured: a Ctrl+Shift+V keystroke produces one keydown AND one native
        // `paste` event on xterm's helper textarea. Handling the keydown as well
        // made every paste arrive TWICE ("echo PASTED_OKecho PASTED_OK").
        // Returning false from this handler does not help — the native paste
        // event is a separate event, not xterm's key processing. That event is
        // caught in the capture phase on the host instead (above), and goes
        // through `pasteText`.
        //
        // Letting the browser own keyboard paste is also strictly better: it works
        // for whatever gesture the platform maps to paste (Cmd+V on macOS), and it
        // does not need the `clipboard-read` permission that `readText()` does.
        // The gestures below have no native path into the pty, so those still go
        // through `paste()`.
        if (key === "c") {
          void copy();
          return false;
        }
        if (key === "f") {
          setSearchOpen(true);
          // Focus on the next tick: the input may not be mounted yet this frame.
          requestAnimationFrame(() => searchInputRef.current?.focus());
          return false;
        }
      }
      if (mod && !e.shiftKey) {
        // Ctrl+= as well as Ctrl++ : on most layouts `+` needs Shift, so the
        // unshifted key that shares it has to count or zoom-in is unreachable.
        if (e.key === "+" || e.key === "=") {
          zoom(1);
          return false;
        }
        if (e.key === "-" || e.key === "_") {
          zoom(-1);
          return false;
        }
        if (e.key === "0") {
          zoom(0);
          return false;
        }
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        searchRef.current?.clearDecorations();
        instance.focus();
        return false;
      }
      return true;
    });
  }, [generation, paste, copy, zoom, searchOpen, jumpToPrompt, openHere]);

  // The jump keys are bound in xterm's own key handler above, so only the
  // focused Terminal takes them; the shortcuts list shows them from here.
  useEffect(
    () =>
      system.shortcuts.document([
        {
          id: "terminal.prompt-previous",
          keys: "ctrl+shift+up",
          description: "Terminal: jump to the previous prompt",
          scope: "Editing",
        },
        {
          id: "terminal.prompt-next",
          keys: "ctrl+shift+down",
          description: "Terminal: jump to the next prompt",
          scope: "Editing",
        },
        {
          id: "terminal.new-here",
          keys: "ctrl+shift+n",
          description: "Terminal: a new Terminal in this one's folder",
          scope: "Editing",
          note: "In a browser tab Chrome and Edge keep it for a private window; Alt+Shift+N works there",
        },
        {
          id: "terminal.new-here-alt",
          keys: "alt+shift+n",
          description: "Terminal: a new Terminal in this one's folder",
          scope: "Editing",
        },
      ]),
    [system],
  );

  const findNext = useCallback((value: string) => {
    if (!value) return;
    searchRef.current?.findNext(value, { decorations: undefined });
  }, []);
  const findPrevious = useCallback((value: string) => {
    if (!value) return;
    searchRef.current?.findPrevious(value, { decorations: undefined });
  }, []);

  // ── A click in the command being typed moves the cursor there ─────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  }, []);
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      const instance = termRef.current;
      const start = inputStartRef.current;
      const screen = hostRef.current?.querySelector(".xterm-screen");
      // Only a click (a drag still selects), while the shell waits for typing,
      // with no program reading the mouse, on the normal screen.
      if (!down || !instance || !start || start.marker.isDisposed || !screen) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || instance.hasSelection()) return;
      if (shellRef.current.phase !== "input" || instance.modes.mouseTrackingMode !== "none") return;
      const buf = instance.buffer.active;
      if (buf.type !== "normal") return;

      const box = screen.getBoundingClientRect();
      const col = Math.floor(((e.clientX - box.left) / box.width) * instance.cols);
      const row = Math.floor(((e.clientY - box.top) / box.height) * instance.rows);
      if (col < 0 || row < 0 || col >= instance.cols || row >= instance.rows) return;

      // The command's rows: the one typing starts on and those wrapped from it.
      const first = start.marker.line;
      const rows: Cell[][] = [];
      for (let y = first; ; y++) {
        const line = buf.getLine(y);
        if (!line || (y > first && !line.isWrapped)) break;
        const cells: Cell[] = [];
        for (let x = 0; x < instance.cols; x++) {
          const cell = line.getCell(x);
          cells.push({ chars: cell?.getChars() ?? "", width: cell?.getWidth() ?? 1 });
        }
        rows.push(cells);
      }
      const n = arrowsTo(
        { rows, startCol: start.col, cursor: { row: buf.baseY + buf.cursorY - first, col: buf.cursorX } },
        { row: buf.viewportY + row - first, col },
      );
      if (n) sendInput(arrowKeys(n, instance.modes.applicationCursorKeysMode));
    },
    [sendInput],
  );

  // ── Middle-click paste, and a right-click that pastes too ─────────────────
  // The X11 convention, and the one thing users try first in a browser terminal.
  const onAuxClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      void paste();
    },
    [paste],
  );

  const statusLine =
    status.kind === "retrying"
      ? `${status.message} reconnecting (${status.attempt}/5)`
      : status.kind === "closed"
        ? status.message
        : null;

  return (
    <div className="bg-surface flex h-full w-full flex-col overflow-hidden">
      {/* Thin status/action strip. Only present when there is something to say or
          do — an always-on toolbar would cost rows in the app whose whole job is
          showing as many rows as possible. */}
      {(statusLine || searchOpen) && (
        <div className="border-outline-variant bg-surface-container-low flex shrink-0 items-center gap-1 border-b px-2 py-1">
          {statusLine && (
            <>
              <Plug size={11} className="text-on-surface-variant shrink-0" />
              <span className="font-ui text-on-surface-variant text-label min-w-0 flex-1 truncate">{statusLine}</span>
              {status.kind === "closed" && status.canRetry && (
                <Button
                  variant="primary"
                  size="sm"
                  className="flex h-5 shrink-0 items-center gap-1 px-1.5"
                  onClick={reconnect}
                >
                  <RotateCw size={11} />
                  Reconnect
                </Button>
              )}
            </>
          )}
          {searchOpen && (
            <div className="flex shrink-0 items-center gap-1">
              <Search size={11} className="text-on-surface-variant" />
              <input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  findNext(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) findPrevious(searchTerm);
                    else findNext(searchTerm);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSearchOpen(false);
                    termRef.current?.focus();
                  }
                }}
                placeholder="Find in scrollback"
                aria-label="Find in scrollback"
                className="rounded-control border-outline-variant bg-surface-container-lowest font-ui text-on-surface focus-visible:ring-primary text-label w-44 border px-1 py-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                aria-label="Find previous"
                onClick={() => findPrevious(searchTerm)}
              >
                <ChevronUp size={11} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                aria-label="Find next"
                onClick={() => findNext(searchTerm)}
              >
                <ChevronDown size={11} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                aria-label="Close search"
                onClick={() => {
                  setSearchOpen(false);
                  termRef.current?.focus();
                }}
              >
                <X size={11} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* The surface token, not a literal — this is the line ui-conventions §8/§46
          flagged, and it is what makes the Terminal follow the theme. */}
      <div
        ref={paneRef}
        className="relative min-h-0 flex-1 p-1"
        onAuxClick={onAuxClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          // Right-click pastes, the way most browser terminals behave. Preventing
          // the native menu is the point: its Paste item cannot reach the pty.
          e.preventDefault();
          void paste();
        }}
      >
        <div ref={attachHost} className="h-full w-full" />
        {/* The kit tooltip's look, placed at the pointer: the kit's Tooltip wraps a
            trigger element, and an OSC 8 link is a range of cells, not an element. */}
        {linkTip && (
          <div
            role="tooltip"
            className="border-outline-variant bg-inverse-surface rounded-control font-ui text-inverse-on-surface text-label z-tooltip pointer-events-none absolute max-w-80 border px-2 py-1 break-all shadow-(--k-shadow-tooltip)"
            style={{ left: linkTip.left, top: linkTip.top }}
          >
            {linkTip.url}
          </div>
        )}
      </div>

      {/* Font-size range is enforced in `fontSize.ts`; surfaced here only so the
          zoom keys have a discoverable equivalent. */}
      <span className="sr-only">
        Font size {fontSize} of {MIN_FONT_SIZE}–{MAX_FONT_SIZE}, default {DEFAULT_FONT_SIZE}
      </span>
      {confirmDialog}
    </div>
  );
}
