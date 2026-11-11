import type { ComponentType } from "react";
import { PROTOCOL_VERSION, SHARED_KIT_VERSION } from "@imbatranim/ui";
import type { MarketplaceApp } from "../../shared/registry/marketplace";

/**
 * The sentences a window shows instead of an app that cannot run here, or
 * null when it can. Checked before anything is leased, fetched or added to
 * the page.
 */

/** An app that needs a newer system protocol than this desktop speaks. */
export function protocolRefusal(app: Pick<MarketplaceApp, "name" | "minSystemVersion">): string | null {
  return PROTOCOL_VERSION < app.minSystemVersion
    ? `${app.name} needs system protocol ${app.minSystemVersion}; this desktop speaks ${PROTOCOL_VERSION}`
    : null;
}

/**
 * A kit app built against another shared kit than this desktop's (brief
 * 163). Either way round: an older kit app may use an export this desktop
 * removed, a newer one an export it does not have yet.
 */
export function kitRefusal(app: Pick<MarketplaceApp, "name" | "sharedKit">): string | null {
  if (app.sharedKit == null || app.sharedKit === SHARED_KIT_VERSION) return null;
  return `${app.name} was built for shared kit ${app.sharedKit}, and this desktop has shared kit ${SHARED_KIT_VERSION}. It needs an update built for kit ${SHARED_KIT_VERSION}.`;
}

/**
 * Anything React can render as a component: a function or class, or the
 * object `memo` / `forwardRef` / `lazy` return.
 */
export function isComponent<P>(value: unknown): value is ComponentType<P> {
  return typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value);
}

/** A hook a kit app's descriptor may declare, by the name its module exports it under. */
export type KitHookExport = "Background" | "commandSources";

/**
 * A hook the descriptor declares and the module does not export (or exports
 * as something else). The app's windows still open; only the hook is refused.
 */
export function hookRefusal(app: Pick<MarketplaceApp, "name">, hook: KitHookExport): string {
  return hook === "Background"
    ? `${app.name} declares a background service, but its module does not export Background, a React component.`
    : `${app.name} declares command sources, but its module does not export commandSources, a list of sources each with a group, search and activate.`;
}
