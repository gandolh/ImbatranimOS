import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type IBufferRange } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, Plug, RotateCw, Search, X } from "lucide-react";
import { Button, useConfirm, useSystem, useSystemAppearance } from "@imbatranim/ui";
import { usePtyConnection } from "./hooks/usePtyConnection";
import { safePaste } from "./lib/paste";
import { linkAction } from "./lib/links";
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
  const { status, sendInput, sendResize, reconnect } = usePtyConnection({ getTerm, generation });

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
  }, [generation, paste, copy, zoom, searchOpen]);

  const findNext = useCallback((value: string) => {
    if (!value) return;
    searchRef.current?.findNext(value, { decorations: undefined });
  }, []);
  const findPrevious = useCallback((value: string) => {
    if (!value) return;
    searchRef.current?.findPrevious(value, { decorations: undefined });
  }, []);

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
