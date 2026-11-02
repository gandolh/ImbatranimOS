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

/** As the Terminal: a sign-out reaches an open socket within this window. */
export const WAYLAND_REVOKE_SWEEP_MS = 30_000;

/** Messages from the tab are small JSON (the viewport; input later). */
export const MAX_CLIENT_MESSAGE = 64 * 1024;

/** Close codes the desktop reads. */
export const CLOSE_SESSION_IN_USE = 4409;
export const CLOSE_UNAVAILABLE = 4503;
export const CLOSE_REVOKED = 4401;

/** Where a viewport size from the tab is clamped. */
export const MAX_VIEWPORT = 16384;
