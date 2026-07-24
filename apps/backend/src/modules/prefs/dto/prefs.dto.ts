/**
 * The prefs store has no fixed schema: callers upsert an arbitrary bag of
 * JSON-serializable key/value pairs (server-side "dotfiles" for frontend
 * stores), and read the whole bag back. A class-validator DTO would force a
 * fixed shape and (with the app's global `whitelist: true` pipe) strip any
 * property lacking a decorator, which is exactly wrong here — so this stays a
 * plain type alias and shape validation happens in PrefsService instead.
 */
export type PrefsMap = Record<string, unknown>;
