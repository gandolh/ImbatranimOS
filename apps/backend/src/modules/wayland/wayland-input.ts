import type { HostInbound, TextEditMessage } from "./wayland.protocol";
import { MAX_CLIPBOARD_BYTES, MAX_RATIO, MAX_TEXT_INPUT_BYTES, MAX_VIEWPORT } from "./wayland.constants";

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

const isU32 = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const isFiniteIn = (v: unknown, limit: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * The keyboard layouts Settings → Linux apps offers, by the id the tab sends.
 * The host builds each one's xkb keymap; anything else never reaches it.
 */
export const KEYBOARD_LAYOUTS = ["us", "ro"] as const;

/** A viewport dimension from the tab: a positive integer, clamped. */
export function clampSize(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1024;
  return Math.min(n, MAX_VIEWPORT);
}

/**
 * The tab's devicePixelRatio: a positive number up to MAX_RATIO, and 1 when
 * it is missing or malformed. The host makes its ceiling the output's scale.
 */
export function clampRatio(v: unknown): number {
  const n = v === null || v === "" ? NaN : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(n, MAX_RATIO);
}

/** A high surrogate with no low one after it, or a low one with no high before. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Text for a text-input event: at most MAX_TEXT_INPUT_BYTES of UTF-8, and no
 * NUL, which a Wayland string can't carry, and no lone surrogate, which
 * JSON.stringify writes as an escape the host's parser refuses.
 */
const isEditText = (v: unknown): v is string =>
  typeof v === "string" &&
  !v.includes("\u0000") &&
  !LONE_SURROGATE.test(v) &&
  Buffer.byteLength(v, "utf8") <= MAX_TEXT_INPUT_BYTES;

/**
 * The tab's edit of a Linux app's text field: each part optional, each one
 * present checked whole. Anything unknown in it is left behind.
 */
function textEdit(session: string, m: Record<string, unknown>): TextEditMessage | null {
  if (!isU32(m.toplevel)) return null;
  const out: TextEditMessage = {
    type: "text_edit",
    session,
    toplevel: m.toplevel,
  };
  if (m.delete !== undefined) {
    const d = m.delete as Record<string, unknown> | null;
    if (
      !d ||
      typeof d !== "object" ||
      !isIntIn(d.before, 0, MAX_TEXT_INPUT_BYTES) ||
      !isIntIn(d.after, 0, MAX_TEXT_INPUT_BYTES)
    ) {
      return null;
    }
    out.delete = { before: d.before, after: d.after };
  }
  if (m.commit !== undefined) {
    if (!isEditText(m.commit)) return null;
    out.commit = m.commit;
  }
  if (m.preedit !== undefined) {
    const p = m.preedit as Record<string, unknown> | null;
    if (!p || typeof p !== "object" || !isEditText(p.text)) return null;
    const bytes = Buffer.byteLength(p.text, "utf8");
    const cursorOk = (c: unknown) => c === undefined || isIntIn(c, -1, bytes);
    if (!cursorOk(p.cursor_begin) || !cursorOk(p.cursor_end)) return null;
    out.preedit = { text: p.text };
    if (p.cursor_begin !== undefined) out.preedit.cursor_begin = p.cursor_begin;
    if (p.cursor_end !== undefined) out.preedit.cursor_end = p.cursor_end;
  }
  return out;
}

/** Turn one message from the tab into one for the host, or null. */
export function toHostMessage(session: string, m: Record<string, unknown>): HostInbound | null {
  switch (m.type) {
    case "viewport":
      return {
        type: "output",
        session,
        width: clampSize(m.width),
        height: clampSize(m.height),
        ratio: clampRatio(m.ratio),
      };
    case "focus":
      if (m.toplevel !== null && !isU32(m.toplevel)) return null;
      return { type: "focus", session, toplevel: m.toplevel };
    case "pointer_motion":
      if (!isU32(m.toplevel) || !isFiniteIn(m.x, MAX_VIEWPORT * 2) || !isFiniteIn(m.y, MAX_VIEWPORT * 2)) {
        return null;
      }
      return {
        type: "pointer_motion",
        session,
        toplevel: m.toplevel,
        x: m.x,
        y: m.y,
      };
    case "pointer_button":
      if (!isU32(m.toplevel) || !isIntIn(m.button, BUTTON_MIN, BUTTON_MAX) || typeof m.pressed !== "boolean") {
        return null;
      }
      return {
        type: "pointer_button",
        session,
        toplevel: m.toplevel,
        button: m.button,
        pressed: m.pressed,
      };
    case "pointer_axis":
      if (
        !isU32(m.toplevel) ||
        !isFiniteIn(m.dx, AXIS_MAX) ||
        !isFiniteIn(m.dy, AXIS_MAX) ||
        !isIntIn(m.v120x, -AXIS_MAX * 120, AXIS_MAX * 120) ||
        !isIntIn(m.v120y, -AXIS_MAX * 120, AXIS_MAX * 120) ||
        typeof m.wheel !== "boolean"
      ) {
        return null;
      }
      return {
        type: "pointer_axis",
        session,
        toplevel: m.toplevel,
        dx: m.dx,
        dy: m.dy,
        v120x: m.v120x,
        v120y: m.v120y,
        wheel: m.wheel,
      };
    case "pointer_leave":
      return { type: "pointer_leave", session };
    case "key":
      if (!isIntIn(m.keycode, 1, KEYCODE_MAX) || typeof m.pressed !== "boolean") return null;
      return { type: "key", session, keycode: m.keycode, pressed: m.pressed };
    case "configure":
      if (!isU32(m.toplevel) || typeof m.maximized !== "boolean") return null;
      return {
        type: "configure",
        session,
        toplevel: m.toplevel,
        width: clampSize(m.width),
        height: clampSize(m.height),
        maximized: m.maximized,
      };
    case "close":
      if (!isU32(m.toplevel)) return null;
      return { type: "close", session, toplevel: m.toplevel };
    case "position":
      if (
        !isU32(m.toplevel) ||
        !isIntIn(m.x, -MAX_VIEWPORT, MAX_VIEWPORT) ||
        !isIntIn(m.y, -MAX_VIEWPORT, MAX_VIEWPORT)
      ) {
        return null;
      }
      return {
        type: "position",
        session,
        toplevel: m.toplevel,
        x: m.x,
        y: m.y,
      };
    case "press_outside":
      return { type: "press_outside", session };
    case "visibility":
      if (typeof m.visible !== "boolean") return null;
      return { type: "visibility", session, visible: m.visible };
    case "toplevel_visible":
      if (!isU32(m.toplevel) || typeof m.visible !== "boolean") return null;
      return {
        type: "toplevel_visible",
        session,
        toplevel: m.toplevel,
        visible: m.visible,
      };
    case "keyboard_layout":
      if (!(KEYBOARD_LAYOUTS as readonly unknown[]).includes(m.layout)) {
        return null;
      }
      return {
        type: "keyboard_layout",
        session,
        layout: m.layout as (typeof KEYBOARD_LAYOUTS)[number],
      };
    case "clipboard":
      // The tab's clipboard text for a paste key in a Linux window.
      if (
        typeof m.text !== "string" ||
        m.text.length === 0 ||
        Buffer.byteLength(m.text, "utf8") > MAX_CLIPBOARD_BYTES
      ) {
        return null;
      }
      return { type: "clipboard", session, text: m.text };
    case "text_edit":
      return textEdit(session, m);
    default:
      return null;
  }
}
