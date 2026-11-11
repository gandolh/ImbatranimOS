/**
 * Which app is calling, beside which user.
 *
 * Every app reaches the OS through its `system` handle, and core mints each
 * running copy of an app (a window, or a windowless service, widget or layer)
 * a token of its own. The handle sends it with every call in
 * {@link APP_TOKEN_HEADER}; the `AppIdentityGuard` maps it back to the app and
 * the copy, and puts the result on the request. A call without the header is
 * the user's: the desktop's own UI, Files and the Terminal send none.
 *
 * The container has one Linux user and no root, so an app's identity can't be
 * a Linux user: the OS keeps it, and its own file API checks it.
 */

/** The request header a `system` call carries its app's token in. */
export const APP_TOKEN_HEADER = "x-imbatranim-app-token";

/** The group every built-in app shares; an installed app's second group is its descriptor's id. */
export const SYSTEM_GROUP = "system";

/**
 * The `code` in a 403's body when the token itself is refused: never issued,
 * revoked, idle too long, or minted under another session. Core reads it to
 * mint the window a new token and try once more, which is how open windows
 * outlive a backend restart. A 403 with any other code is a real refusal.
 */
export const APP_TOKEN_REFUSED = "APP_TOKEN_REFUSED";

/** A running copy of an app, as the backend knows it. */
export interface AppIdentity {
  /** The app, which acts as a Unix user. */
  readonly appId: string;
  /** This running copy, which acts as a pid. Core's window id for a window. */
  readonly instanceId: string;
  /** The window the copy runs in, or null for a service, widget or layer. */
  readonly windowId: string | null;
  /**
   * Its groups, Unix's user-private-group scheme: its own (named after the
   * app) first, then its install group, the descriptor's id for an installed
   * app (so a suite's apps share one) or {@link SYSTEM_GROUP} for a built-in.
   * Deduplicated: a single-app descriptor's app has one.
   */
  readonly groups: readonly string[];
}
