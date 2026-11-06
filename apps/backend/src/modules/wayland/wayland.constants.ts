/** The Linux windows WebSocket, beside the Terminal's under `/api`. */
export const WAYLAND_PATH = '/api/wayland';

/**
 * Desktop sessions with Linux windows at once. One per tab; each costs a
 * Wayland display in the host, so a client opening sockets in a loop is
 * capped here.
 */
export const MAX_WAYLAND_SESSIONS = 8;

/**
 * The tab's socket may hold this much before the host is told it can send a
 * window's next frame. Until then the host keeps folding new damage into the
 * window's next frame, so a slow link gets the latest picture, not a queue.
 */
export const FRAME_ACK_LOW_WATER = 512 * 1024;
export const FRAME_ACK_POLL_MS = 50;

/**
 * Sound packets are dropped while the tab's socket holds more than this: a
 * link that far behind would play them seconds late. Sound is about 16 kB/s,
 * so it never holds frames up itself.
 */
export const AUDIO_DROP_ABOVE = 1024 * 1024;

/** As the Terminal: a sign-out reaches an open socket within this window. */
export const WAYLAND_REVOKE_SWEEP_MS = 30_000;

/**
 * Messages from the tab are small JSON, except a paste's text: up to
 * MAX_CLIPBOARD_BYTES of it, with room for JSON escaping.
 */
export const MAX_CLIENT_MESSAGE = 2 * 1024 * 1024;

/**
 * The most clipboard text that crosses to the Linux apps, in UTF-8 bytes. The
 * host refuses more, and the tab doesn't send it.
 */
export const MAX_CLIPBOARD_BYTES = 1024 * 1024;

/**
 * The most text a text-input message carries, in UTF-8 bytes: text-input-v3
 * caps surrounding text there, under the Wayland message size, and the host
 * refuses more. Deletes reach no further either.
 */
export const MAX_TEXT_INPUT_BYTES = 4000;

/**
 * A session outlives its socket this long, so a reload finds its apps
 * again; closing the tab ends them after it (decisions-linux-apps.md).
 */
export const WAYLAND_GRACE_MS = 30_000;

/**
 * A second socket for a session whose socket is still open waits this long
 * for that one to close: on a reload, the new page's socket can arrive
 * before the old page's close does. Still open after it, the second is a
 * duplicated tab.
 */
export const WAYLAND_TAKEOVER_WAIT_MS = 2_000;

/** Apps get SIGTERM when their session ends, and SIGKILL this much later. */
export const WAYLAND_KILL_AFTER_MS = 5_000;

/** Close codes the desktop reads. */
export const CLOSE_SESSION_IN_USE = 4409;
export const CLOSE_UNAVAILABLE = 4503;
export const CLOSE_REVOKED = 4401;
/** The session is still ending (its apps are being stopped); try again shortly. */
export const CLOSE_SESSION_ENDING = 4410;

/** Where a viewport size from the tab is clamped. */
export const MAX_VIEWPORT = 16384;
/**
 * Where a devicePixelRatio from the tab is clamped. The host's output scale
 * is the ratio's ceiling, and stops at 2 well below this.
 */
export const MAX_RATIO = 8;
