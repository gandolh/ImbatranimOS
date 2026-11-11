import type { ComponentType } from "react";
import type { CommandSource } from "./commandSource";
import type { SystemHandle } from "./system";

/**
 * The shared kit: what a marketplace **kit app** links against at
 * runtime instead of bundling. The desktop puts its own instances of React,
 * React DOM and this package on `globalThis.__imbatranimShared` before the
 * first kit app loads; the app's build marks {@link SHARED_KIT_MODULES}
 * external and reads each import from there, so `useSystem()`, the dialogs
 * and the theme it renders are the desktop's own.
 *
 * Not a protocol change: `PROTOCOL_VERSION` (`./system`) versions the handle,
 * this versions the modules.
 */

/**
 * The version of the shared modules' contract. Goes up when one of them
 * changes incompatibly: a React major, a kit export removed, or a kit
 * component's props changed in a breaking way. Adding an export or a module
 * is not a bump. A kit app's descriptor names the version its build was made
 * against (`sharedKit`), and the desktop refuses to render it when this
 * differs.
 *
 * Declared inline on purpose: an outside repo's snapshot of this directory
 * reads the value from this line.
 */
export const SHARED_KIT_VERSION = 1;

/** The specifiers the desktop shares, the keys of `__imbatranimShared.modules`. */
export const SHARED_KIT_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@imbatranim/ui",
] as const;

export type SharedKitModule = (typeof SHARED_KIT_MODULES)[number];

/**
 * Where things are, for a marketplace app: the third argument to a module's
 * `mount`, and a kit app's `host` prop.
 */
export type NativeHostContext = {
  appId: string;
  /** The URL of the directory the app's module was served from, ending in `/`. */
  assetBase: string;
  /**
   * A `mount` app's server, through the desktop's session-checked proxy,
   * leased while its window is open. Null for a static app, and always null
   * for a kit app (since kit 1.2.0): a kit app asks with
   * `system.server.request()` when it needs the server.
   */
  server: { http: string; ws: string } | null;
};

/** The props the desktop renders a kit app's `App` export with. */
export type KitAppProps = { windowId: string; host: NativeHostContext };

/**
 * The handle a kit app's `Background` reads with `useSystem()` (since kit
 * 1.5.0): a running copy of the app with no window. `window` is the inert
 * one (its writes do nothing), `intents.consume` finds nothing, and
 * `server.request()` rejects: only a window holds the app's server. The rest
 * is fenced to the descriptor's capabilities, as a window's handle is.
 */
export type WindowlessSystemHandle = SystemHandle & { readonly windowId: null };

/** The props the desktop renders a kit app's `Background` export with. */
export type KitBackgroundProps = { host: NativeHostContext };

/**
 * What a kit app's module exports (since kit 1.5.0 for the hooks). `App` is
 * the window. `Background` and `commandSources` are hooks: the desktop looks
 * for each only when the app's descriptor declares it (`background: true`,
 * `commandSources: true`), and loads such a module after sign-in, with no
 * window open. A declared hook the module does not export is refused by name.
 */
export type KitAppModule = {
  App: ComponentType<KitAppProps>;
  /**
   * Mounted with no window from sign-in until sign-out while the app is
   * enabled. Renders nothing; it exists for its effects, which are cheap: one
   * slow interval, no per-frame work. One that throws is hidden with one
   * notification until it is turned off and on, or the page reloads.
   */
  Background?: ComponentType<KitBackgroundProps>;
  /** Searched by the command palette and Start while the app is enabled. */
  commandSources?: readonly CommandSource[];
};
