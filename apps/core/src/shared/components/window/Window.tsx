import React, { useRef, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "../../../lib/cn";
import { APP_REGISTRY } from "../../registry/registry";
import { useRegistryVersion } from "../../registry/marketplace";
import {
  useWindowStore,
  type SnapRegion,
  detectSnapRegion,
  taskbarHeight,
  TITLEBAR_MIN_VISIBLE,
  topVisibleWindowId,
} from "../../store/windowStore";
import { SnapOverlay } from "./SnapOverlay";
import { forgetWindowFocus, rememberWindowFocus } from "./focusIntoWindow";

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** How far a press on the title bar moves before it is a drag, in CSS pixels (use-gesture's tap filter). */
const DRAG_THRESHOLD = 3;

type WindowProps = {
  windowId: string;
  minSize: { width: number; height: number };
  children: React.ReactNode;
  isFocused: boolean;
  /**
   * False when this window lives on a workspace that is not on screen. It is
   * still mounted — see the `display` rule below.
   */
  onActiveWorkspace?: boolean;
  /**
   * The frame and resize edges without the title bar: a Linux app that draws
   * its own title bar gets no second one. Its own bar moves the window.
   */
  frameOnly?: boolean;
  /**
   * Open and close with the fade only, no zoom. Chromium's renderer crashed
   * (2026-11-03, headless and full builds) when any window's zoom ran while a
   * Linux app's window was on screen and drawing: as it opened, and when
   * another window opened beside Firefox playing a video.
   */
  fadeOnly?: boolean;
};

type ResizeHandleProps = {
  direction: ResizeDirection;
  instanceId: string;
  minSize: { width: number; height: number };
};

function ResizeHandle({ direction, instanceId, minSize }: ResizeHandleProps) {
  const updatePosition = useWindowStore((s) => s.updatePosition);
  const updateSize = useWindowStore((s) => s.updateSize);

  // Plain pointer events, as the title bar's drag: a press here follows the
  // pointer on the window until it lets go.
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const pointerId = e.pointerId;
      const pointer = { x: e.clientX, y: e.clientY };
      let start: { width: number; height: number; posX: number; posY: number } | null = null;

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const mx = ev.clientX - pointer.x;
        const my = ev.clientY - pointer.y;
        if (!start) {
          if (Math.hypot(mx, my) < DRAG_THRESHOLD) return;
          const win = useWindowStore.getState().windows.find((w) => w.id === instanceId);
          if (!win) return;
          start = { width: win.size.width, height: win.size.height, posX: win.position.x, posY: win.position.y };
        }

        const maxW = window.innerWidth - start.posX;
        const maxH = window.innerHeight - taskbarHeight() - start.posY;

        let newW = start.width;
        let newH = start.height;
        let newX = start.posX;
        let newY = start.posY;

        if (direction.includes("e")) {
          newW = Math.max(minSize.width, Math.min(maxW, start.width + mx));
        }
        if (direction.includes("s")) {
          newH = Math.max(minSize.height, Math.min(maxH, start.height + my));
        }
        if (direction.includes("w")) {
          const delta = Math.min(mx, start.width - minSize.width);
          newW = start.width - delta;
          newX = start.posX + delta;
        }
        if (direction.includes("n")) {
          const minY = 0;
          const maxDelta = start.posY - minY;
          const delta = Math.min(my, start.height - minSize.height);
          const clampedDelta = Math.max(delta, -maxDelta);
          newH = start.height - clampedDelta;
          newY = start.posY + clampedDelta;
        }

        updateSize(instanceId, { width: newW, height: newH });
        updatePosition(instanceId, { x: newX, y: newY });
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) stop();
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        cleanup.current = null;
      };
      cleanup.current?.();
      cleanup.current = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [direction, instanceId, minSize.width, minSize.height, updatePosition, updateSize],
  );

  const cursorMap: Record<ResizeDirection, string> = {
    n: "cursor-n-resize",
    s: "cursor-s-resize",
    e: "cursor-e-resize",
    w: "cursor-w-resize",
    ne: "cursor-ne-resize",
    nw: "cursor-nw-resize",
    se: "cursor-se-resize",
    sw: "cursor-sw-resize",
  };

  const positionClasses: Record<ResizeDirection, string> = {
    n: "top-0 left-1 right-1 h-1",
    s: "bottom-0 left-1 right-1 h-1",
    e: "top-1 right-0 bottom-1 w-1",
    w: "top-1 left-0 bottom-1 w-1",
    ne: "top-0 right-0 w-2 h-2",
    nw: "top-0 left-0 w-2 h-2",
    se: "bottom-0 right-0 w-2 h-2",
    sw: "bottom-0 left-0 w-2 h-2",
  };
  // Apricot's rounded frame clips its corners, hit-testing included, so an 8px
  // handle there is mostly unreachable; the corners grab 12px instead.
  const corner = direction.length === 2 ? "apricot:h-3 apricot:w-3" : "";

  return (
    <div
      onPointerDown={onPointerDown}
      className={cn("absolute z-10 touch-none", cursorMap[direction], positionClasses[direction], corner)}
    />
  );
}

export const Window = React.memo(function Window({
  windowId,
  minSize,
  children,
  isFocused,
  onActiveWorkspace = true,
  frameOnly = false,
  fadeOnly = false,
}: WindowProps) {
  const instance = useWindowStore((s) => s.windows.find((w) => w.id === windowId));
  const still = useReducedMotion() === true;
  // The title band's glyph comes from the registry, which a Marketplace sync
  // fills after the window may have opened.
  useRegistryVersion();
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const hideWindow = useWindowStore((s) => s.hideWindow);
  const maximizeWindow = useWindowStore((s) => s.maximizeWindow);
  const restoreWindow = useWindowStore((s) => s.restoreWindow);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const updatePosition = useWindowStore((s) => s.updatePosition);
  const snapWindow = useWindowStore((s) => s.snapWindow);
  const unsnap = useWindowStore((s) => s.unsnap);

  const [snapPreview, setSnapPreview] = useState<SnapRegion | null>(null);

  // Dragging by the title bar. While the pointer moves, the frame is shifted
  // with the CSS `translate` property, on the compositor: no store update, no
  // render and no layout per move (each move was a React commit and two
  // layouts, about 4.5 ms of main thread for a File Manager window). The
  // position is written once, when the pointer lets go, and the shift comes
  // off in the same frame (the layout effect below). `translate`, not
  // `transform`: framer-motion owns the frame's `transform` for its scale.
  const frameRef = useRef<HTMLDivElement>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const settling = useRef(false);
  useEffect(() => () => dragCleanup.current?.(), []);

  const onTitleBarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0 || !instance || instance.isMaximized) return;
      const id = instance.id;
      const pointerId = e.pointerId;
      const start = { x: e.clientX, y: e.clientY };
      let origin: { x: number; y: number } | null = null;
      let size = instance.size;
      let at = { x: 0, y: 0 };
      let region: SnapRegion | null = null;

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const mx = ev.clientX - start.x;
        const my = ev.clientY - start.y;
        if (!origin) {
          // A press that hasn't moved past this is a click, not a drag.
          if (Math.hypot(mx, my) < DRAG_THRESHOLD) return;
          const now = useWindowStore.getState().windows.find((w) => w.id === id);
          if (!now) return;
          origin = { ...now.position };
          focusWindow(id);
          if (now.snapState) {
            // Back to its size before the snap, where it is now, under the pointer.
            unsnap(id);
            updatePosition(id, origin);
            size = useWindowStore.getState().windows.find((w) => w.id === id)?.size ?? size;
          }
        }
        at = {
          x: Math.max(0, Math.min(origin.x + mx, window.innerWidth - size.width)),
          y: Math.max(0, Math.min(origin.y + my, window.innerHeight - taskbarHeight() - TITLEBAR_MIN_VISIBLE)),
        };
        const el = frameRef.current;
        if (el) el.style.translate = `${at.x - origin.x}px ${at.y - origin.y}px`;
        const detected = detectSnapRegion(ev.clientX, ev.clientY);
        if (detected !== region) {
          region = detected;
          setSnapPreview(detected);
        }
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        stop();
        if (!origin) return;
        setSnapPreview(null);
        settling.current = true;
        if (region) snapWindow(id, region);
        else updatePosition(id, at);
        // Nothing moved in the store: no render will come to take the shift off.
        const after = useWindowStore.getState().windows.find((w) => w.id === id);
        if (!region && after && after.position.x === origin.x && after.position.y === origin.y) {
          settling.current = false;
          if (frameRef.current) frameRef.current.style.translate = "";
        }
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        dragCleanup.current = null;
      };
      dragCleanup.current?.();
      dragCleanup.current = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [instance, focusWindow, unsnap, updatePosition, snapWindow],
  );

  // The drag's end moved the window in the store; once React has drawn it
  // there, before the frame is painted, the shift that showed it comes off.
  const pos = instance?.position;
  const size = instance?.size;
  useLayoutEffect(() => {
    if (!settling.current) return;
    settling.current = false;
    if (frameRef.current) frameRef.current.style.translate = "";
  }, [pos?.x, pos?.y, size?.width, size?.height]);

  // A click anywhere in a window raises it, unless the click itself brought
  // another window to the front: an Open button that opened or
  // raised another app runs before its click bubbles here, and raising this
  // window then would cover the app it just put up. The capture handler runs
  // before any handler inside the window and notes the store's z counter;
  // every open, raise or restore mints a z from it, closing and minimising
  // don't. So if the counter moved and this window is not the top one now,
  // the click raised another window and this one stays where it is.
  const zAtClickStart = useRef<number | null>(null);
  const handleWindowClickCapture = useCallback(() => {
    zAtClickStart.current = useWindowStore.getState().nextZIndex;
  }, []);
  const handleWindowClick = useCallback(() => {
    const before = zAtClickStart.current;
    zAtClickStart.current = null;
    const raisedAnother =
      before !== null && useWindowStore.getState().nextZIndex !== before && topVisibleWindowId() !== windowId;
    if (raisedAnother) return;
    focusWindow(windowId);
  }, [focusWindow, windowId]);

  const handleMaximizeToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (instance?.isMaximized) {
        restoreWindow(windowId);
      } else {
        maximizeWindow(windowId);
      }
    },
    [windowId, instance?.isMaximized, maximizeWindow, restoreWindow],
  );

  const handleHide = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      hideWindow(windowId);
    },
    [hideWindow, windowId],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeWindow(windowId);
    },
    [closeWindow, windowId],
  );

  const handleContentFocus = useCallback((e: React.FocusEvent) => rememberWindowFocus(windowId, e.target), [windowId]);
  useEffect(() => () => forgetWindowFocus(windowId), [windowId]);

  if (!instance) return null;
  const AppIcon = APP_REGISTRY.find((a) => a.id === instance.appId)?.icon;

  return (
    <>
      {/* Snap preview overlay — rendered in portal so it covers the full viewport */}
      {snapPreview && createPortal(<SnapOverlay region={snapPreview} />, document.body)}

      <AnimatePresence>
        <m.div
          key={instance.id}
          ref={frameRef}
          initial={still ? false : { opacity: 0, scale: fadeOnly ? 1 : 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={
            still
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, scale: fadeOnly ? 1 : 0.95, transition: { duration: 0.1 } }
          }
          transition={still ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
          style={{
            position: "fixed",
            left: instance.position.x,
            top: instance.position.y,
            width: instance.size.width,
            height: instance.size.height,
            zIndex: instance.zIndex,
            // Hidden, not unmounted, for a window that is minimised OR on
            // another workspace — same mechanism, same reason: the app keeps
            // its sockets, its buffers and its scroll position.
            display: instance.isVisible && onActiveWorkspace ? "flex" : "none",
            flexDirection: "column",
            fontFamily: "var(--font-ui)",
          }}
          className={cn(
            "bg-surface-container-low overflow-hidden",
            // Square against the screen's edges: maximised or snapped.
            !instance.isMaximized && !instance.snapState && "rounded-window",
            isFocused
              ? "border-primary apricot:border-outline-variant border shadow-(--k-shadow-window-focused)"
              : "border-outline-variant border shadow-(--k-shadow-window)",
          )}
          onClickCapture={handleWindowClickCapture}
          onClick={handleWindowClick}
          // Addressable from the outside. Every UI probe so far has had to guess
          // at a window by its text; the compositor knowing its own id costs a
          // string and is not part of any app's API.
          data-window-id={instance.id}
          data-app-id={instance.appId}
        >
          {/* Resize handles — only when not maximized */}
          {!instance.isMaximized && (
            <>
              {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeDirection[]).map((dir) => (
                <ResizeHandle key={dir} direction={dir} instanceId={instance.id} minSize={minSize} />
              ))}
            </>
          )}

          {/* Title bar — double-click toggles maximize/restore,
              the reflex every desktop user carries. */}
          <div
            onPointerDown={onTitleBarPointerDown}
            onDoubleClick={handleMaximizeToggle}
            style={{
              touchAction: "none",
              userSelect: "none",
              display: frameOnly ? "none" : undefined,
            }}
            className={cn(
              "flex h-[30px] shrink-0 items-center justify-between border-b pr-1 pl-3",
              // Apricot's title band is 40 px (2026-11-13); a phone's is 48.
              "apricot:h-[40px] phone:h-[48px]",
              isFocused
                ? "bg-surface-container-high apricot:bg-surface-container border-outline-variant text-on-surface"
                : "bg-surface-container apricot:bg-surface-container-low border-outline-variant text-on-surface-variant",
            )}
          >
            {/* Left: the app's glyph in Apricot (an accent tick in Classic) + title */}
            <span className="flex min-w-0 items-center gap-2 pr-2 select-none">
              <span
                className={cn(
                  "rounded-control apricot:hidden h-2.5 w-2.5 shrink-0",
                  isFocused ? "bg-primary" : "bg-outline-variant",
                )}
              />
              {AppIcon && (
                <AppIcon
                  size={14}
                  strokeWidth={1.75}
                  className={cn(
                    "apricot:block hidden shrink-0",
                    isFocused ? "text-primary" : "text-on-surface-variant",
                  )}
                />
              )}
              <span className="text-control truncate font-semibold">{instance.title}</span>
            </span>

            {/* Right: window controls */}
            <div
              className="flex shrink-0 items-center gap-[2px]"
              onClick={(e) => e.stopPropagation()}
              // A fast double-press on Minimize must not ALSO toggle maximize
              // via the title bar's dblclick — stop it like click above.
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <TitleBarButton onClick={handleHide} title="Minimize">
                <Minus size={13} strokeWidth={2} />
              </TitleBarButton>
              <TitleBarButton
                onClick={handleMaximizeToggle}
                title={instance.isMaximized ? "Restore" : "Maximize"}
                // A phone's window is always maximized above the taskbar.
                className="phone:hidden"
              >
                {instance.isMaximized ? <Copy size={12} strokeWidth={2} /> : <Square size={11} strokeWidth={2} />}
              </TitleBarButton>
              <TitleBarButton onClick={handleClose} title="Close" isClose>
                <X size={13} strokeWidth={2} />
              </TitleBarButton>
            </div>
          </div>

          {/* Window body. Focusable by script only (tabIndex -1), as the last
              place the taskbar or Alt+Tab can put the keyboard;
              its focus handler remembers where the keyboard was in the app. */}
          <div
            data-window-content=""
            tabIndex={-1}
            onFocus={handleContentFocus}
            // Every floating layer's body is surface-container-low (2026-11-13).
            className="bg-surface-container-low text-on-surface min-h-0 flex-1 overflow-auto outline-none"
          >
            {children}
          </div>
        </m.div>
      </AnimatePresence>
    </>
  );
});

type TitleBarButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  isClose?: boolean;
  className?: string;
  children: React.ReactNode;
};

function TitleBarButton({ onClick, title, isClose = false, className, children }: TitleBarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-control flex h-7 w-7 items-center justify-center",
        "apricot:rounded-item apricot:h-[28px] apricot:w-[32px] phone:h-[48px] phone:w-[48px]",
        "cursor-pointer border-none text-current outline-none",
        "transition-colors duration-75 motion-reduce:transition-none",
        isClose
          ? "hover:bg-error-container hover:text-on-error-container"
          : "hover:bg-surface-container-highest apricot:hover:bg-surface-container-high",
        "focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-inset",
        className,
      )}
    >
      {children}
    </button>
  );
}
