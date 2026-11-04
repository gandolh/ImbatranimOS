import type { HostInbound } from './wayland.protocol';
import { MAX_VIEWPORT } from './wayland.constants';

/**
 * What the tab may say on `/api/wayland`, checked field by field before the
 * host hears it. Anything malformed is dropped: the tab is the signed-in
 * owner's, but the host is a native process and gets only well-formed input.
 */

/** Linux pointer buttons the desktop sends: BTN_LEFT (0x110) to BTN_TASK (0x117). */
const BUTTON_MIN = 0x110;
const BUTTON_MAX = 0x117;
/** Linux key codes are below KEY_MAX (0x2ff). */
const KEYCODE_MAX = 0x2ff;
/** Scroll per message, in pixels; more is a broken client, not a fast wheel. */
const AXIS_MAX = 10_000;

const isU32 = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const isFiniteIn = (v: unknown, limit: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * The keyboard layouts Settings → Linux apps offers, by the id the tab sends.
 * The host builds each one's xkb keymap; anything else never reaches it.
 */
export const KEYBOARD_LAYOUTS = ['us', 'ro'] as const;

/** A viewport dimension from the tab: a positive integer, clamped. */
export function clampSize(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1024;
  return Math.min(n, MAX_VIEWPORT);
}

/** Turn one message from the tab into one for the host, or null. */
export function toHostMessage(
  session: string,
  m: Record<string, unknown>,
): HostInbound | null {
  switch (m.type) {
    case 'viewport':
      return {
        type: 'output',
        session,
        width: clampSize(m.width),
        height: clampSize(m.height),
      };
    case 'focus':
      if (m.toplevel !== null && !isU32(m.toplevel)) return null;
      return { type: 'focus', session, toplevel: m.toplevel };
    case 'pointer_motion':
      if (
        !isU32(m.toplevel) ||
        !isFiniteIn(m.x, MAX_VIEWPORT * 2) ||
        !isFiniteIn(m.y, MAX_VIEWPORT * 2)
      ) {
        return null;
      }
      return {
        type: 'pointer_motion',
        session,
        toplevel: m.toplevel,
        x: m.x,
        y: m.y,
      };
    case 'pointer_button':
      if (
        !isU32(m.toplevel) ||
        !isIntIn(m.button, BUTTON_MIN, BUTTON_MAX) ||
        typeof m.pressed !== 'boolean'
      ) {
        return null;
      }
      return {
        type: 'pointer_button',
        session,
        toplevel: m.toplevel,
        button: m.button,
        pressed: m.pressed,
      };
    case 'pointer_axis':
      if (
        !isU32(m.toplevel) ||
        !isFiniteIn(m.dx, AXIS_MAX) ||
        !isFiniteIn(m.dy, AXIS_MAX) ||
        !isIntIn(m.v120x, -AXIS_MAX * 120, AXIS_MAX * 120) ||
        !isIntIn(m.v120y, -AXIS_MAX * 120, AXIS_MAX * 120) ||
        typeof m.wheel !== 'boolean'
      ) {
        return null;
      }
      return {
        type: 'pointer_axis',
        session,
        toplevel: m.toplevel,
        dx: m.dx,
        dy: m.dy,
        v120x: m.v120x,
        v120y: m.v120y,
        wheel: m.wheel,
      };
    case 'pointer_leave':
      return { type: 'pointer_leave', session };
    case 'key':
      if (!isIntIn(m.keycode, 1, KEYCODE_MAX) || typeof m.pressed !== 'boolean')
        return null;
      return { type: 'key', session, keycode: m.keycode, pressed: m.pressed };
    case 'configure':
      if (!isU32(m.toplevel) || typeof m.maximized !== 'boolean') return null;
      return {
        type: 'configure',
        session,
        toplevel: m.toplevel,
        width: clampSize(m.width),
        height: clampSize(m.height),
        maximized: m.maximized,
      };
    case 'close':
      if (!isU32(m.toplevel)) return null;
      return { type: 'close', session, toplevel: m.toplevel };
    case 'position':
      if (
        !isU32(m.toplevel) ||
        !isIntIn(m.x, -MAX_VIEWPORT, MAX_VIEWPORT) ||
        !isIntIn(m.y, -MAX_VIEWPORT, MAX_VIEWPORT)
      ) {
        return null;
      }
      return {
        type: 'position',
        session,
        toplevel: m.toplevel,
        x: m.x,
        y: m.y,
      };
    case 'press_outside':
      return { type: 'press_outside', session };
    case 'visibility':
      if (typeof m.visible !== 'boolean') return null;
      return { type: 'visibility', session, visible: m.visible };
    case 'toplevel_visible':
      if (!isU32(m.toplevel) || typeof m.visible !== 'boolean') return null;
      return {
        type: 'toplevel_visible',
        session,
        toplevel: m.toplevel,
        visible: m.visible,
      };
    case 'keyboard_layout':
      if (!(KEYBOARD_LAYOUTS as readonly unknown[]).includes(m.layout)) {
        return null;
      }
      return {
        type: 'keyboard_layout',
        session,
        layout: m.layout as (typeof KEYBOARD_LAYOUTS)[number],
      };
    default:
      return null;
  }
}
