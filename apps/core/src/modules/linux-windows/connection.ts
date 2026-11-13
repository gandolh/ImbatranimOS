import { desktopSessionId, renewDesktopSessionId } from "@imbatranim/ui";
import {
  taskbarHeight,
  dropLinuxPlaces,
  keepLinuxPlaces,
  takeLinuxPlace,
  topVisibleWindowId,
  useWindowStore,
} from "../../shared/store/windowStore";
import { useAuthStore } from "../auth/store/authStore";
import { useLinuxAppsPrefs } from "./keyboardLayout";
import { LINUX_APP_PREFIX, linuxWindowChrome } from "./kind";
import { paintFrame, parseFrame } from "./frames";
import { linuxClipboard } from "./clipboard";
import { cursorCss, type LinuxCursorImage } from "./cursor";
import { linuxSound } from "./sound";
import { soundGain, useSoundStore } from "../../shared/store/soundStore";
import { LinuxNotifications, notifyAppStopped } from "./linuxNotifications";
import {
  canvasFor,
  dropAllCanvases,
  dropCanvas,
  noteLinuxFrame,
  setLinuxSender,
  useLinuxWindowsStore,
  windowForToplevel,
  type Geometry,
  type LinuxTextInput,
  type LinuxToplevel,
} from "./linuxWindowsStore";

/** Close codes the backend uses (wayland.constants.ts). */
const CLOSE_REVOKED = 4401;
const CLOSE_SESSION_IN_USE = 4409;
const CLOSE_UNAVAILABLE = 4503;

const RETRY_MAX_MS = 30_000;
/** Linux apps can't run on this machine; look again now and then. */
const UNAVAILABLE_RETRY_MS = 5 * 60_000;
const VIEWPORT_DEBOUNCE_MS = 250;

type ToplevelMessage = {
  type: "toplevel_created" | "toplevel_updated";
  toplevel: number;
  title: string;
  app_id: string;
  width: number;
  height: number;
  scale: number;
  geometry: Geometry;
  decorations: "server" | "client";
  min_width: number;
  min_height: number;
  max_width: number;
  max_height: number;
};
type PopupMessage = {
  type: "popup_created" | "popup_updated";
  popup: number;
  parent: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  geometry: Geometry;
  grab: boolean;
};
type ServerMessage =
  | ToplevelMessage
  | PopupMessage
  | { type: "popup_destroyed"; popup: number }
  | { type: "toplevel_destroyed"; toplevel: number }
  | { type: "cursor"; name: string; image?: LinuxCursorImage }
  | { type: "request"; toplevel: number; action: string; edges?: string }
  | { type: "unavailable"; reason: string }
  | { type: "session"; resumed: boolean }
  | { type: "clipboard"; text: string }
  | {
      type: "notification";
      id: number;
      app: string;
      summary: string;
      body: string;
      hasDefault?: boolean;
    }
  | { type: "notification_close"; id: number }
  | { type: "app_stopped"; app: string; reason: "memory" }
  | ({ type: "text_input" } & LinuxTextInput);

type Viewport = { width: number; height: number; ratio: number };

/**
 * Where Linux apps' windows are drawn: the desktop above the taskbar, in CSS
 * pixels, and the screen's devicePixelRatio. The host makes the ratio's
 * ceiling its output's scale, so apps draw as many pixels as the screen has.
 */
function viewport(): Viewport {
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight - taskbarHeight()),
    ratio: window.devicePixelRatio || 1,
  };
}

/** As the Terminal's socket URL: beside the API, ws or wss to match. */
export function buildWaylandUrl(session: string, size: Viewport): string {
  const query =
    `?session=${encodeURIComponent(session)}&width=${size.width}&height=${size.height}` + `&ratio=${size.ratio}`;
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (base) {
    const u = new URL(base, window.location.href);
    const scheme = u.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${u.host}${u.pathname.replace(/\/+$/, "")}/wayland${query}`;
  }
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}/api/wayland${query}`;
}

function shape(m: ToplevelMessage): Omit<LinuxToplevel, "windowId" | "toplevel"> {
  return {
    title: m.title || m.app_id || "Linux app",
    appId: m.app_id,
    width: m.width,
    height: m.height,
    scale: m.scale || 1,
    geometry: m.geometry,
    decorations: m.decorations,
    min: { width: m.min_width, height: m.min_height },
    max: { width: m.max_width, height: m.max_height },
  };
}

/**
 * This tab's Linux windows socket: opens an OS window for each toplevel the
 * host announces, paints its frames, passes input back, and closes the window
 * when the toplevel goes. One per tab, started once the desktop is signed in.
 *
 * When it drops, the windows go; the backend keeps the session and its apps
 * for a while, so the reconnect (or a reload, which keeps the session id)
 * gets them back. It also says when the cover screen is up (the apps freeze),
 * when the tab is hidden, and which windows are minimized (they go quiet).
 */
export class LinuxWindowsConnection {
  private ws: WebSocket | null = null;
  private stopped = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private renewedOnce = false;
  private viewportTimer: ReturnType<typeof setTimeout> | null = null;
  /** One paint at a time per toplevel, so frames land in order. */
  private painting = new Map<number, Promise<void>>();
  private unsubscribeWindows: (() => void) | null = null;
  /** The toplevel the host was last told has keyboard focus. */
  private focused: number | null = null;
  /** Whether each toplevel's OS window shows, as the host was last told. */
  private shown = new Map<number, boolean>();
  private unsubscribeAuth: (() => void) | null = null;
  private unsubscribeLayout: (() => void) | null = null;
  private unsubscribeSound: (() => void) | null = null;
  /** The desktop session the socket is for: with a toplevel's id, a window's key. */
  private session = "";
  /**
   * The backend said this socket took back a running session (a reload or a
   * reconnect inside its grace): the windows it announces until the host's
   * resync is over are ones the tab had, and go back to their kept places.
   */
  private resuming = false;
  /** The session's Linux apps' notifications, as OS notifications. */
  private notifications: LinuxNotifications | null = null;

  /** Browsers let a page make sound after a gesture: a press or a key does it. */
  private readonly onGesture = () => linuxSound.unlock();

  private readonly onVisibility = () => {
    this.send({ type: "visibility", visible: document.visibilityState !== "hidden" });
  };

  /**
   * A press outside every Linux window takes the keyboard from their apps,
   * as a click elsewhere does on any desktop, so their open menus close. A
   * press in a Linux window goes to its app, which closes its own menus.
   */
  private readonly onPressAnywhere = (e: PointerEvent) => {
    const popups = Object.values(useLinuxWindowsStore.getState().popups);
    if (popups.length === 0) return;
    const target = e.target as Element | null;
    if (target?.closest?.("[data-linux-popup], [data-linux-window]")) return;
    this.send({ type: "press_outside" });
  };

  /**
   * Matches the devicePixelRatio the tab is at. It changes when the window
   * moves to another screen (no resize event) or the page zooms; the viewport
   * then goes again with the new ratio, and the query follows the new one.
   */
  private ratioQuery: MediaQueryList | null = null;

  private watchRatio(): void {
    this.ratioQuery?.removeEventListener("change", this.onRatioChange);
    this.ratioQuery = null;
    if (this.stopped || typeof window.matchMedia !== "function") return;
    this.ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.ratioQuery.addEventListener("change", this.onRatioChange);
  }

  private readonly onRatioChange = () => {
    this.watchRatio();
    this.onResize();
  };

  private readonly onResize = () => {
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.viewportTimer = setTimeout(() => {
      this.send({ type: "viewport", ...viewport() });
    }, VIEWPORT_DEBOUNCE_MS);
  };

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("resize", this.onResize);
    this.watchRatio();
    document.addEventListener("pointerdown", this.onPressAnywhere, true);
    document.addEventListener("pointerdown", this.onGesture, true);
    document.addEventListener("keydown", this.onGesture, true);
    document.addEventListener("visibilitychange", this.onVisibility);
    // Keyboard focus follows the window manager's focused window, and a
    // minimized window goes quiet.
    this.unsubscribeWindows = useWindowStore.subscribe(() => {
      this.syncFocus();
      this.syncShown();
    });
    // The cover screen, by idle timeout or by hand, freezes the apps.
    this.unsubscribeAuth = useAuthStore.subscribe((s, prev) => {
      if (s.locked !== prev.locked) this.send({ type: "cover", covered: s.locked });
    });
    // A new layout reaches the running apps at once: the host sends them the
    // keymap, no restart.
    this.unsubscribeLayout = useLinuxAppsPrefs.subscribe((s, prev) => {
      if (s.keyboardLayout !== prev.keyboardLayout) this.sendLayout();
    });
    // The tray's volume and mute play the session's sound louder or softer
    // in this tab; the host mixes at full volume.
    linuxSound.setVolume(soundGain(useSoundStore.getState()));
    this.unsubscribeSound = useSoundStore.subscribe((s) => linuxSound.setVolume(soundGain(s)));
    setLinuxSender((m) => this.send(m));
    this.notifications = new LinuxNotifications((m) => this.send(m));
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("resize", this.onResize);
    this.watchRatio();
    document.removeEventListener("pointerdown", this.onPressAnywhere, true);
    document.removeEventListener("pointerdown", this.onGesture, true);
    document.removeEventListener("keydown", this.onGesture, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.unsubscribeLayout?.();
    this.unsubscribeLayout = null;
    this.unsubscribeSound?.();
    this.unsubscribeSound = null;
    this.unsubscribeWindows?.();
    this.unsubscribeWindows = null;
    setLinuxSender(null);
    this.notifications?.dispose();
    this.notifications = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, "stopped");
    linuxSound.dispose();
    this.closeAllWindows();
  }

  private connect(): void {
    if (this.stopped) return;
    this.session = desktopSessionId();
    this.resuming = false;
    const ws = new WebSocket(buildWaylandUrl(this.session, viewport()));
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.focused = null;
      this.shown.clear();
      // Where this tab stands now, which a resumed session may not know.
      this.send({ type: "cover", covered: useAuthStore.getState().locked });
      this.onVisibility();
      this.sendLayout();
    };
    ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => this.onMessage(ev.data);
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      linuxSound.reset();
      this.closeAllWindows();
      this.scheduleReconnect(ev.code);
    };
  }

  private scheduleReconnect(code: number): void {
    if (this.stopped) return;
    let delay: number;
    if (code === CLOSE_SESSION_IN_USE && !this.renewedOnce) {
      // A duplicated tab carries the original's id: take a new one.
      renewDesktopSessionId();
      this.renewedOnce = true;
      delay = 0;
    } else if (code === CLOSE_UNAVAILABLE) {
      delay = UNAVAILABLE_RETRY_MS;
    } else if (code === CLOSE_REVOKED) {
      delay = RETRY_MAX_MS;
    } else {
      delay = Math.min(RETRY_MAX_MS, 1000 * 2 ** this.retries);
      this.retries++;
    }
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  /** The keyboard layout the owner chose for Linux apps. */
  private sendLayout(): void {
    this.send({ type: "keyboard_layout", layout: useLinuxAppsPrefs.getState().keyboardLayout });
  }

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  /** Tell the host which toplevels' OS windows are minimized or on another workspace. */
  private syncShown(): void {
    const { windows, activeWorkspace } = useWindowStore.getState();
    for (const t of Object.values(useLinuxWindowsStore.getState().byWindow)) {
      const win = windows.find((w) => w.id === t.windowId);
      if (!win) continue;
      const shown = win.isVisible && win.workspaceId === activeWorkspace;
      if (this.shown.get(t.toplevel) === shown) continue;
      // A new window shows; say nothing until that changes.
      if (!this.shown.has(t.toplevel) && shown) {
        this.shown.set(t.toplevel, shown);
        continue;
      }
      this.shown.set(t.toplevel, shown);
      this.send({ type: "toplevel_visible", toplevel: t.toplevel, visible: shown });
    }
  }

  /** Tell the host which Linux window, if any, the window manager focused. */
  private syncFocus(): void {
    const top = topVisibleWindowId();
    const t = top ? useLinuxWindowsStore.getState().byWindow[top] : undefined;
    const next = t ? t.toplevel : null;
    if (next === this.focused) return;
    this.focused = next;
    this.send({ type: "focus", toplevel: next });
  }

  private onMessage(data: ArrayBuffer | string): void {
    if (typeof data !== "string") {
      if (linuxSound.receive(data)) return;
      const frame = parseFrame(data);
      if (!frame) return;
      noteLinuxFrame(frame.rects.reduce((sum, r) => sum + r.w * r.h, 0));
      const popup = useLinuxWindowsStore.getState().popups[frame.toplevel];
      const toplevel = popup ? undefined : windowForToplevel(frame.toplevel);
      if (!popup && !toplevel) return;
      // The scale as of this frame: the host announces a new one before the
      // first frame drawn at it.
      const scale = (popup ?? toplevel)?.scale ?? 1;
      const canvas = canvasFor(frame.toplevel);
      const prev = this.painting.get(frame.toplevel) ?? Promise.resolve();
      const next = prev.then(() => paintFrame(canvas, frame, scale)).catch(() => undefined);
      this.painting.set(frame.toplevel, next);
      return;
    }
    let m: ServerMessage;
    try {
      m = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    if (m.type === "toplevel_created") this.created(m);
    else if (m.type === "toplevel_updated") this.updated(m);
    else if (m.type === "toplevel_destroyed") this.destroyed(m.toplevel);
    else if (m.type === "popup_created" || m.type === "popup_updated") this.popup(m);
    else if (m.type === "popup_destroyed") this.popupGone(m.popup);
    else if (m.type === "session") this.sessionStarted(m.resumed);
    else if (m.type === "cursor") {
      // A resync ends with the cursor: every window still running has been
      // announced, so a place none of them took is a window that's gone.
      if (this.resuming) {
        this.resuming = false;
        dropLinuxPlaces();
      }
      useLinuxWindowsStore.getState().setCursor(cursorCss(m.name, m.image));
    } else if (m.type === "request") this.request(m.toplevel, m.action, m.edges);
    else if (m.type === "clipboard" && typeof m.text === "string") void linuxClipboard.fromLinux(m.text);
    else if (m.type === "notification") this.notifications?.show(m);
    else if (m.type === "notification_close") this.notifications?.close(m.id);
    else if (m.type === "app_stopped") notifyAppStopped(m.app);
    else if (m.type === "text_input") this.textInput(m);
  }

  /**
   * The app's text field with text-input focus: its window's hidden input
   * follows it, for a phone's keyboard (hiddenTextInput.ts).
   */
  private textInput(m: { type: "text_input" } & LinuxTextInput): void {
    useLinuxWindowsStore.getState().setTextInput({
      toplevel: m.toplevel,
      enabled: m.enabled === true,
      purpose: typeof m.purpose === "string" ? m.purpose : "normal",
      hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === "string") : [],
      text: typeof m.text === "string" ? m.text : null,
      cursor: Number.isInteger(m.cursor) ? m.cursor : 0,
      anchor: Number.isInteger(m.anchor) ? m.anchor : 0,
      rect: m.rect ?? null,
      cause: m.cause === "other" ? "other" : "input_method",
    });
  }

  /** A fresh session has none of the windows the tab kept places for. */
  private sessionStarted(resumed: boolean): void {
    this.resuming = resumed;
    if (!resumed) this.notifications?.forget();
    if (!resumed) dropLinuxPlaces();
  }

  private created(m: ToplevelMessage): void {
    if (windowForToplevel(m.toplevel)) {
      this.updated(m);
      return;
    }
    const s = shape(m);
    const chrome = linuxWindowChrome(s.decorations === "server");
    const key = { session: this.session, toplevel: m.toplevel };
    // A window the tab had before a reload goes back where it was; a new one
    // opens where any new window does.
    const place = this.resuming ? takeLinuxPlace(key) : null;
    const windows = useWindowStore.getState();
    const windowId = windows.openWindow(
      LINUX_APP_PREFIX + (m.app_id || "app"),
      s.title,
      place?.size ?? {
        width: s.geometry.width + chrome.width,
        height: s.geometry.height + chrome.height,
      },
      { width: 120, height: 80 },
      place?.position,
    );
    windows.adoptLinuxWindow(windowId, key, place);
    // The close button asks the app; the window closes when its toplevel
    // goes, which may be never (the app asked to save, or refused).
    windows.registerCloseGuard(windowId, () => {
      this.send({ type: "close", toplevel: m.toplevel });
      return false;
    });
    useLinuxWindowsStore.getState().add({ toplevel: m.toplevel, windowId, ...s });
    this.syncFocus();
  }

  private updated(m: ToplevelMessage): void {
    const t = windowForToplevel(m.toplevel);
    if (!t) return;
    const s = shape(m);
    if (s.title !== t.title) useWindowStore.getState().updateTitle(t.windowId, s.title);
    useLinuxWindowsStore.getState().update(t.windowId, s);
  }

  private destroyed(toplevel: number): void {
    const t = windowForToplevel(toplevel);
    if (!t) return;
    useLinuxWindowsStore.getState().remove(t.windowId);
    this.painting.delete(toplevel);
    dropCanvas(toplevel);
    const windows = useWindowStore.getState();
    windows.unregisterCloseGuard(t.windowId);
    windows.closeWindow(t.windowId);
  }

  private popup(m: PopupMessage): void {
    useLinuxWindowsStore.getState().setPopup({
      popup: m.popup,
      parent: m.parent,
      x: m.x,
      y: m.y,
      width: m.width,
      height: m.height,
      scale: m.scale || 1,
      geometry: m.geometry,
      grab: m.grab,
    });
  }

  private popupGone(popup: number): void {
    useLinuxWindowsStore.getState().removePopup(popup);
    this.painting.delete(popup);
    dropCanvas(popup);
  }

  /**
   * The app asked the window manager for something. Maximize, restore and
   * minimize map to its own actions (it has no fullscreen, so fullscreen
   * maximizes); a move or resize from the app's own title bar or edge is
   * started by the window body, which knows where the pointer is.
   */
  private request(toplevel: number, action: string, edges?: string): void {
    const t = windowForToplevel(toplevel);
    if (!t) return;
    const windows = useWindowStore.getState();
    const win = windows.windows.find((w) => w.id === t.windowId);
    if (!win) return;
    switch (action) {
      case "maximize":
      case "fullscreen":
        if (!win.isMaximized) windows.maximizeWindow(t.windowId);
        break;
      case "unmaximize":
      case "unfullscreen":
        if (win.isMaximized) windows.restoreWindow(t.windowId);
        break;
      case "minimize":
        windows.hideWindow(t.windowId);
        break;
      case "move":
      case "resize":
        useLinuxWindowsStore.getState().setRequest({ windowId: t.windowId, action, edges });
        break;
    }
  }

  private closeAllWindows(): void {
    const all = Object.values(useLinuxWindowsStore.getState().byWindow);
    // The session may come back (a reconnect inside its grace): its windows
    // then go back where they were.
    const ids = new Set(all.map((t) => t.windowId));
    keepLinuxPlaces(useWindowStore.getState().windows.filter((w) => ids.has(w.id)));
    useLinuxWindowsStore.getState().clear();
    this.painting.clear();
    this.focused = null;
    this.shown.clear();
    dropAllCanvases();
    const windows = useWindowStore.getState();
    for (const t of all) {
      windows.unregisterCloseGuard(t.windowId);
      windows.closeWindow(t.windowId);
    }
  }
}
