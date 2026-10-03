/**
 * WebSocket handshake auth — the reusable session-validation surface for WS
 * endpoints (the terminal today, files later).
 *
 * How a WS gateway validates an upgrade:
 *
 *   import { WardService } from '../ward/ward.service';
 *   // ...inject WardService (exported by the global WardModule), then:
 *   try {
 *     const session = await ward.authenticate(upgradeReq.headers.cookie);
 *   } catch {
 *     socket.destroy();   // reject unauthenticated
 *   }
 *
 * `upgradeReq` is the raw Node `http.IncomingMessage` from the upgrade event;
 * `authenticate` reads the `ward_session` cookie straight off its headers (no
 * cookie middleware needed). **This is the SAME code path the REST guard uses**, so
 * REST and WS never diverge on what a valid session is — the property this file
 * has always existed to hold, and the one thing about it the Ward cutover did
 * not change.
 *
 * Two things did change and both matter to a gateway:
 *
 *  - **It is async now.** Verification is local, but liveness is a call to
 *    Ward — cached 30 seconds per token, so a sweep at that interval costs
 *    roughly one request per session per window rather than one per check.
 *  - **A grant is checked, not just a session.** `authenticate` establishes who;
 *    the caller must still confirm they hold an `imbatranimos` grant, exactly as
 *    the REST guard does. A live Ward account from another app in the estate is
 *    not authorised to open a shell here.
 */
export { WardService } from '../ward/ward.service';
export type { WardCaller } from '../ward/ward.types';
export { IMBATRANIMOS_APP_SLUG } from '../ward/ward.types';
