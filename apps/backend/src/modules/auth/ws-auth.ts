/**
 * WebSocket handshake auth: the session check for WS endpoints (the terminal,
 * the Browser's relay, a marketplace app's socket).
 *
 * How a WS gateway validates an upgrade:
 *
 *   import { LocalIdentityService } from '../auth/ws-auth';
 *   // ...inject it (exported by the global IdentityModule), then:
 *   try {
 *     const caller = await identity.authenticate(upgradeReq.headers.cookie);
 *   } catch {
 *     socket.destroy();   // reject unauthenticated
 *   }
 *
 * `upgradeReq` is the raw Node `http.IncomingMessage` from the upgrade event;
 * `authenticate` reads the `imb_session` cookie straight off its headers (no
 * cookie middleware needed). **This is the SAME code path the REST guard
 * uses**, so REST and WS never diverge on what a valid session is.
 * `pty-upgrade.ts`'s `authorizeUpgrade` wraps it with the Origin check.
 */
export { LocalIdentityService } from '../local-identity/local-identity.service';
export type { Caller } from '../identity/identity.types';
