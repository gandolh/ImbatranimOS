/**
 * WebSocket handshake auth — the reusable session-validation surface for
 * future WS endpoints (terminal, files). There are no WS endpoints yet; this
 * is the contract they will consume.
 *
 * How a WS gateway validates an upgrade:
 *
 *   import { SessionService } from '../auth/session.service';
 *   // ...inject SessionService (exported by AuthModule), then at upgrade:
 *   const session = sessionService.validateFromRequest(upgradeReq);
 *   if (!session) { socket.destroy(); return; }   // reject unauthenticated
 *
 * `upgradeReq` is the raw Node `http.IncomingMessage` from the upgrade event;
 * validateFromRequest reads the `imb_session` cookie straight off its headers
 * (no cookie-parser needed) and checks it against the session store. This is
 * the SAME code path the REST guard uses, so REST and WS never diverge.
 */
export { SessionService } from './session.service';
export type { SessionRecord } from './session.service';
export {
  SESSION_COOKIE_NAME,
  readSessionCookie,
  parseCookieHeader,
} from './auth.constants';
