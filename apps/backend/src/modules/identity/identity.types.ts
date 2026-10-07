/**
 * Who is calling, as the guard and the WebSocket upgrades see it.
 *
 * There is one identity path: the machine's own single-owner sign-in
 * (brief 152, the only one since brief 157). `LocalIdentityService.authenticate`
 * turns a `Cookie` header into a {@link Caller} or throws
 * {@link AuthenticationError}.
 */

/** The signed-in owner, for one request or one socket. */
export interface Caller {
  /** Stable for the owner. There is one owner, so one subject. */
  readonly subject: string;
  readonly username: string;
  /** Stable for one session and reveals nothing usable: a prefix of the token's hash. */
  readonly sid: string;
}

/**
 * The cookie is not usable: absent, unknown, expired or signed out. An
 * ordinary 401.
 */
export class AuthenticationError extends Error {
  override readonly name: string = 'AuthenticationError';
  readonly statusCode = 401;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
