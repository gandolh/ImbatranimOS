import type { IncomingMessage } from 'http';
import { PTY_PATH } from './pty.constants';

import {
  IMBATRANIMOS_APP_SLUG,
  type WardCaller,
  type WardService,
} from '../auth/ws-auth';

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
 * Authorize a WS upgrade using the SAME code path as the REST guard.
 *
 * Returns the session on success, or null to reject — the caller destroys the
 * socket. Reads Ward's `ward_session` cookie straight off the raw upgrade
 * request; no cookie-parser is involved.
 *
 * **Both halves are required and neither is optional.** `authenticate`
 * establishes that the session is live; the grant check establishes that this
 * particular account may open a shell on this machine. Skipping the second
 * would let anyone who registered at prm — which is open to the public — reach
 * a terminal, and that is precisely the failure the estate's grant model
 * exists to prevent.
 */
export async function authorizeUpgrade(
  req: Pick<IncomingMessage, 'headers'>,
  ward: Pick<WardService, 'authenticate'>,
  frontendUrl: string,
): Promise<WardCaller | null> {
  if (!isOriginAllowed(req, frontendUrl)) return null;
  try {
    const session = await ward.authenticate(req.headers.cookie);
    const roles = session.grants[IMBATRANIMOS_APP_SLUG] ?? [];
    // Ward being unreachable throws here too, and lands in the same `null`.
    // For a WebSocket that is the right collapse: there is no status code to
    // distinguish with, and failing closed is the only safe answer.
    return roles.length > 0 ? session : null;
  } catch {
    return null;
  }
}
