import { evdevButton } from "./keymap";
import { sendToLinuxApps } from "./linuxWindowsStore";

/** Wayland's scroll value for one wheel notch (libinput's 15 degrees). */
const WHEEL_NOTCH_VALUE = 15;

/** What a wheel event becomes for a Linux app: pixels, plus notches from a wheel. */
export function wheelMessage(e: WheelEvent): {
  dx: number;
  dy: number;
  v120x: number;
  v120y: number;
  wheel: boolean;
} {
  const legacy = e as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number };
  const notches = (d: number | undefined) => d !== undefined && d !== 0 && d % 120 === 0;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL && (notches(legacy.wheelDeltaY) || notches(legacy.wheelDeltaX))) {
    // A mouse wheel: whole notches of 120.
    const v120x = -(legacy.wheelDeltaX ?? 0) || 0;
    const v120y = -(legacy.wheelDeltaY ?? 0) || 0;
    return {
      dx: (v120x / 120) * WHEEL_NOTCH_VALUE,
      dy: (v120y / 120) * WHEEL_NOTCH_VALUE,
      v120x,
      v120y,
      wheel: true,
    };
  }
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    // Lines, three to a notch.
    return {
      dx: e.deltaX * (WHEEL_NOTCH_VALUE / 3),
      dy: e.deltaY * (WHEEL_NOTCH_VALUE / 3),
      v120x: Math.round(e.deltaX * 40),
      v120y: Math.round(e.deltaY * 40),
      wheel: true,
    };
  }
  // A touchpad: smooth pixels.
  return { dx: e.deltaX, dy: e.deltaY, v120x: 0, v120y: 0, wheel: false };
}

export type PointerHooks = {
  /** A press, before it goes to the app. */
  onDown?: (e: PointerEvent) => void;
  /** A move; returning true keeps it from the app (a drag the desktop runs). */
  onMove?: (e: PointerEvent) => boolean;
  /** A release, before it goes to the app. */
  onUp?: (e: PointerEvent) => void;
};

/**
 * Pass the pointer over `el` to the Linux window (toplevel or popup) `id`,
 * in the coordinates of its surface. `canvas` shows the surface one surface
 * coordinate to one CSS pixel at every scale (a scale-2 window's canvas holds
 * twice the pixels at the same CSS size), so the point is the CSS offset from
 * its corner. A press captures the pointer, so a drag that leaves the element
 * keeps going to the app. Returns the cleanup.
 */
export function attachPointer(
  el: HTMLElement,
  id: number,
  canvas: () => HTMLCanvasElement,
  hooks: PointerHooks = {},
): () => void {
  let down = false;
  const surfacePoint = (e: MouseEvent) => {
    const r = canvas().getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (hooks.onMove?.(e)) return;
    sendToLinuxApps({ type: "pointer_motion", toplevel: id, ...surfacePoint(e) });
  };
  const onPointerDown = (e: PointerEvent) => {
    const button = evdevButton(e.button);
    if (button === undefined) return;
    hooks.onDown?.(e);
    el.setPointerCapture(e.pointerId);
    down = true;
    sendToLinuxApps({ type: "pointer_motion", toplevel: id, ...surfacePoint(e) });
    sendToLinuxApps({ type: "pointer_button", toplevel: id, button, pressed: true });
  };
  const onPointerUp = (e: PointerEvent) => {
    const button = evdevButton(e.button);
    down = false;
    hooks.onUp?.(e);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (button !== undefined) sendToLinuxApps({ type: "pointer_button", toplevel: id, button, pressed: false });
  };
  const onPointerLeave = () => {
    if (!down) sendToLinuxApps({ type: "pointer_leave" });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    sendToLinuxApps({ type: "pointer_axis", toplevel: id, ...wheelMessage(e) });
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
  el.addEventListener("pointerleave", onPointerLeave);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onContextMenu);
  return () => {
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    el.removeEventListener("pointerleave", onPointerLeave);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onContextMenu);
  };
}
