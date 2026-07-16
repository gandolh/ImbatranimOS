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
 * Authorize a WS upgrade using the SAME session code path as the REST guard
 * (Brief 10). Returns the session record on success, or null to reject — the
 * caller destroys the socket. Reads the `imb_session` httpOnly cookie straight
 * off the raw upgrade request; no cookie-parser is involved.
 */
export function authorizeUpgrade(
  req: Pick<IncomingMessage, 'headers'> & { cookies?: Record<string, string> },
  sessions: Pick<SessionService, 'validateFromRequest'>,
): SessionRecord | null {
  try {
    return sessions.validateFromRequest(req);
  } catch {
    return null;
  }
}
