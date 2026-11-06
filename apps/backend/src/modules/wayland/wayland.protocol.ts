/**
 * The control socket between the backend and the Wayland host, TypeScript
 * side. `apps/wayland-host/PROTOCOL.md` describes it once for both sides, and
 * the fixtures in `apps/wayland-host/protocol-fixtures/` are written by the
 * Rust encoder and read by this file's tests.
 *
 * Every message is a little-endian `u32` length of what follows, a kind byte,
 * then the payload: JSON (kind 1) either way, or from the host a frame (kind
 * 2) or a sound packet (kind 3), each a length-prefixed session id followed by
 * the body the WebSocket carries after its own kind byte.
 */

export const KIND_JSON = 1;
export const KIND_FRAME = 2;
export const KIND_AUDIO = 3;

/** A WebSocket binary message starts with one of these, then the body. */
export const WS_KIND_FRAME = 2;
export const WS_KIND_AUDIO = 3;

/** Refuse anything larger, as the host does. */
export const MAX_MESSAGE = 64 * 1024 * 1024;

export const PROTOCOL_VERSION = 7;

/**
 * A desktop session id: random, per tab, and part of a socket's file name
 * (`wayland-<id>`), so only these characters.
 */
const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && SESSION_ID.test(id);
}

/** Backend → host. */
export type HostInbound =
  | {
      type: 'session_open';
      session: string;
      width: number;
      height: number;
      /** The tab's devicePixelRatio; the output's scale is its ceiling. */
      ratio: number;
    }
  | { type: 'session_close'; session: string }
  | {
      type: 'output';
      session: string;
      width: number;
      height: number;
      ratio: number;
    }
  | { type: 'frame_ack'; session: string; toplevel: number }
  | { type: 'focus'; session: string; toplevel: number | null }
  | {
      type: 'pointer_motion';
      session: string;
      toplevel: number;
      x: number;
      y: number;
    }
  | {
      type: 'pointer_button';
      session: string;
      toplevel: number;
      button: number;
      pressed: boolean;
    }
  | {
      type: 'pointer_axis';
      session: string;
      toplevel: number;
      dx: number;
      dy: number;
      v120x: number;
      v120y: number;
      wheel: boolean;
    }
  | { type: 'pointer_leave'; session: string }
  | { type: 'key'; session: string; keycode: number; pressed: boolean }
  | {
      type: 'configure';
      session: string;
      toplevel: number;
      width: number;
      height: number;
      maximized: boolean;
    }
  | { type: 'close'; session: string; toplevel: number }
  | {
      type: 'position';
      session: string;
      toplevel: number;
      x: number;
      y: number;
    }
  | { type: 'press_outside'; session: string }
  | { type: 'resync'; session: string }
  | { type: 'freeze'; session: string; frozen: boolean }
  | { type: 'visibility'; session: string; visible: boolean }
  | { type: 'keyboard_layout'; session: string; layout: 'us' | 'ro' }
  | {
      type: 'toplevel_visible';
      session: string;
      toplevel: number;
      visible: boolean;
    }
  | { type: 'clipboard'; session: string; text: string };

/** Host → backend, JSON kind. */
export type HostOutbound =
  | { type: 'hello'; version: number }
  | {
      type: 'session_ready';
      session: string;
      display: string;
      /** The X display reserved for the session's X11 apps, or null. */
      x11_display: number | null;
    }
  | { type: 'session_failed'; session: string; reason: string }
  | ToplevelMessage
  | PopupMessage
  | { type: 'clients'; session: string; pids: number[] }
  | { type: 'cursor'; session: string; name: string }
  | {
      type: 'request';
      session: string;
      toplevel: number;
      action: string;
      edges?: string;
    }
  | { type: 'clipboard'; session: string; text: string };

export type ToplevelMessage =
  | {
      type: 'toplevel_created' | 'toplevel_updated';
      session: string;
      toplevel: number;
      title: string;
      app_id: string;
      /** The image's size in surface coordinates (CSS pixels). */
      width: number;
      height: number;
      /** Image pixels per surface coordinate. */
      scale: number;
      geometry: { x: number; y: number; width: number; height: number };
      decorations: 'server' | 'client';
      min_width: number;
      min_height: number;
      max_width: number;
      max_height: number;
    }
  | { type: 'toplevel_destroyed'; session: string; toplevel: number };

/**
 * A menu, dropdown or tooltip. Its id shares the toplevels' id space, so
 * frames, acks and pointer input name it the same way.
 */
export type PopupMessage =
  | {
      type: 'popup_created' | 'popup_updated';
      session: string;
      popup: number;
      parent: number;
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
      geometry: { x: number; y: number; width: number; height: number };
      grab: boolean;
    }
  | { type: 'popup_destroyed'; session: string; popup: number };

export type Decoded =
  | { kind: 'json'; message: HostOutbound }
  | { kind: 'frame'; session: string; body: Buffer }
  /** One Opus packet of a session's sound: its sequence number, then the packet. */
  | { kind: 'audio'; session: string; body: Buffer };

export function encodeJson(message: HostInbound): Buffer {
  const json = Buffer.from(JSON.stringify(message), 'utf8');
  const head = Buffer.alloc(5);
  head.writeUInt32LE(json.length + 1, 0);
  head.writeUInt8(KIND_JSON, 4);
  return Buffer.concat([head, json]);
}

export class ProtocolError extends Error {}

/**
 * Splits a byte stream into messages as they arrive. Throws
 * {@link ProtocolError} on anything malformed; the caller drops the
 * connection, since a stream that lost its framing can't be resynchronized.
 */
export class Decoder {
  private chunks: Buffer[] = [];
  private buffered = 0;

  push(chunk: Buffer): Decoded[] {
    this.chunks.push(chunk);
    this.buffered += chunk.length;
    const out: Decoded[] = [];
    for (;;) {
      if (this.buffered < 4) break;
      const head = this.peek(4);
      const len = head.readUInt32LE(0);
      if (len === 0) throw new ProtocolError('empty message');
      if (len > MAX_MESSAGE)
        throw new ProtocolError(`message too large: ${len}`);
      if (this.buffered < 4 + len) break;
      const message = this.take(4 + len).subarray(4);
      out.push(decodeMessage(message));
    }
    return out;
  }

  private peek(n: number): Buffer {
    if (this.chunks[0].length >= n) return this.chunks[0].subarray(0, n);
    const all = Buffer.concat(this.chunks);
    this.chunks = [all];
    return all.subarray(0, n);
  }

  private take(n: number): Buffer {
    const all =
      this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
    const taken = all.subarray(0, n);
    const rest = all.subarray(n);
    this.chunks = rest.length > 0 ? [rest] : [];
    this.buffered = rest.length;
    return taken;
  }
}

function decodeMessage(message: Buffer): Decoded {
  const kind = message[0];
  const payload = message.subarray(1);
  if (kind === KIND_JSON) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString('utf8'));
    } catch {
      throw new ProtocolError('bad JSON');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { type?: unknown }).type !== 'string'
    ) {
      throw new ProtocolError('JSON message without a type');
    }
    return { kind: 'json', message: parsed as HostOutbound };
  }
  if (kind === KIND_FRAME || kind === KIND_AUDIO) {
    const what = kind === KIND_FRAME ? 'frame' : 'audio';
    if (payload.length < 1)
      throw new ProtocolError(`${what} without a session`);
    const sidLen = payload[0];
    // A frame's header is 14 bytes; a sound packet's sequence number 4.
    if (payload.length < 1 + sidLen + (kind === KIND_FRAME ? 14 : 5))
      throw new ProtocolError(`short ${what}`);
    const session = payload.subarray(1, 1 + sidLen).toString('ascii');
    // Copied rather than a view, so one small message doesn't keep a whole
    // read buffer alive.
    const body = Buffer.from(payload.subarray(1 + sidLen));
    return kind === KIND_FRAME
      ? { kind: 'frame', session, body }
      : { kind: 'audio', session, body };
  }
  throw new ProtocolError(`unknown kind ${kind}`);
}

/** The window (toplevel or popup) a frame body is for (its first field). */
export function frameToplevel(body: Buffer): number {
  return body.readUInt32LE(0);
}
