import type { IncomingMessage } from 'http';
import { PTY_PATH } from './pty.constants';
import type { SessionService, SessionRecord } from '../auth/ws-auth';

/**
 * True when a raw upgrade request targets the terminal endpoint. The URL may
 * carry a query string (e.g. `/api/pty?cols=80`), so match on the pathname
 * only. Nest's global `api` prefix does not rewrite raw upgrade URLs, so we
 * compare against the full literal path.
 */
export function isPtyUpgrade(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?', 1)[0];
  return path === PTY_PATH;
}

/**
 * Reject cross-origin upgrades (CSWSH defence, mirroring the REST guard's
 * checkOrigin). A browser always sends `Origin` on a WebSocket handshake, so an
 * attacker page's `new WebSocket(...)` is caught here even though SameSite=Lax
 * already blocks the cookie from riding along cross-site. When `Origin` is
 * present it must equal the configured frontend URL or the request Host; an
 * absent Origin (same-origin / non-browser clients) is allowed.
 */
export function isOriginAllowed(
  req: Pick<IncomingMessage, 'headers'>,
  frontendUrl: string,
): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return origin === frontendUrl || originHost === req.headers.host;
}

/**
 * Authorize a WS upgrade using the SAME session code path as the REST guard
 * (Brief 10). Returns the session record on success, or null to reject — the
 * caller destroys the socket. Reads the `imb_session` httpOnly cookie straight
 * off the raw upgrade request; no cookie-parser is involved. Also enforces the
 * Origin check so a cross-site page cannot hijack the terminal socket.
 */
export function authorizeUpgrade(
  req: Pick<IncomingMessage, 'headers'> & { cookies?: Record<string, string> },
  sessions: Pick<SessionService, 'validateFromRequest'>,
  frontendUrl: string,
): SessionRecord | null {
  if (!isOriginAllowed(req, frontendUrl)) return null;
  try {
    return sessions.validateFromRequest(req);
  } catch {
    return null;
  }
}
