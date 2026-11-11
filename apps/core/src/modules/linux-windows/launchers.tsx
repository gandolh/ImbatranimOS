import { AppWindow } from "lucide-react";
import { desktopSessionId } from "@imbatranim/ui";
import { api } from "../../lib/axios";
import { apiUrl } from "../marketplace/apiUrl";
import { APP_REGISTRY, type AppConfig } from "../../shared/registry/registry";
import { noteRegistryChanged } from "../../shared/registry/marketplace";
import { notify } from "../../shared/store/notificationStore";
import { LINUX_APP_PREFIX } from "./kind";

/**
 * Start's Linux entries: one per `.desktop` file the user's installed Linux
 * apps ship, read by the backend. They are spliced into `APP_REGISTRY`, as
 * marketplace apps are, so Start, the palette, pinning and Settings → Apps
 * treat them like any app; opening one launches the program instead of
 * opening a window. Its windows arrive as Linux windows, whose app id is
 * the same `linux:<id>`, so they find this entry's icon.
 */

/** A desktop action: another way to start the app, such as Firefox's New Window. */
export type LinuxAction = { id: string; name: string };

export type LinuxLauncher = {
  id: string;
  /** In the browser's language when the entry has it (the backend picks). */
  name: string;
  comment: string;
  hasIcon: boolean;
  actions?: LinuxAction[];
  /**
   * The extensions and whole file names it opens as a file (`odt`), which
   * the backend works out from its desktop entry and the shared-mime-info
   * globs. Empty or missing when it takes no file.
   */
  opens?: string[];
};

let launcherIds = new Set<string>();
let launcherActions = new Map<string, LinuxAction[]>();
let launcherOpens = new Map<string, string[]>();

/**
 * The Linux apps that open a file, as app ids in Start's order: those
 * claiming any of `keys` (a file's lowercase extension and whole name), or,
 * with `null`, every one that opens any file.
 */
export function linuxAppsOpening(keys: string[] | null): string[] {
  const out: string[] = [];
  for (const [appId, opens] of launcherOpens) {
    if (keys === null ? opens.length > 0 : keys.some((k) => k !== "" && opens.includes(k))) out.push(appId);
  }
  return out;
}

/** Every extension or name some installed Linux app opens. */
export function linuxOpenedKeys(): string[] {
  return [...new Set([...launcherOpens.values()].flat())];
}

/**
 * The desktop actions of the Linux app `appId` (a launcher's, or a Linux
 * window's, whose app id is the launcher's when the app names itself after
 * its desktop file, as Firefox does). Empty for any other app.
 */
export function linuxLauncherActions(appId: string): LinuxAction[] {
  return launcherActions.get(appId) ?? [];
}

/** The browser's languages, the user's, for the backend to name entries in. */
function languages(): string {
  const list = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  return list.filter(Boolean).join(",");
}

export function isLinuxLauncher(appId: string): boolean {
  return launcherIds.has(appId);
}

function iconUrl(id: string): string {
  return apiUrl(`linux-apps/launchers/${encodeURIComponent(id)}/icon`).href;
}

function toAppConfig(l: LinuxLauncher): AppConfig {
  const url = iconUrl(l.id);
  const Icon: AppConfig["icon"] = ({ size = 18, className }) =>
    l.hasIcon ? (
      <img src={url} width={size} height={size} alt="" className={className} draggable={false} />
    ) : (
      <AppWindow size={size} className={className} />
    );
  return {
    id: LINUX_APP_PREFIX + l.id,
    name: l.name,
    description: l.comment || "A Linux app",
    meta: ["Linux app"],
    icon: Icon,
    // Never rendered: opening a launcher starts the program.
    component: () => null,
    multiInstance: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 120, height: 80 },
  };
}

/** Replace Start's Linux entries with what the profile holds now. */
export function syncLinuxLaunchers(launchers: LinuxLauncher[]): void {
  for (let i = APP_REGISTRY.length - 1; i >= 0; i--) {
    if (launcherIds.has(APP_REGISTRY[i].id)) APP_REGISTRY.splice(i, 1);
  }
  const taken = new Set(APP_REGISTRY.map((a) => a.id));
  const next = new Set<string>();
  const actions = new Map<string, LinuxAction[]>();
  const opensMap = new Map<string, string[]>();
  for (const l of launchers) {
    const app = toAppConfig(l);
    if (taken.has(app.id)) continue;
    APP_REGISTRY.push(app);
    next.add(app.id);
    if (l.actions?.length) actions.set(app.id, l.actions);
    const opens = (l.opens ?? []).map((o) => o.toLowerCase());
    if (opens.length > 0) opensMap.set(app.id, opens);
  }
  launcherIds = next;
  launcherActions = actions;
  launcherOpens = opensMap;
  noteRegistryChanged();
}

/** Read the launchers again: at sign-in, and after an install or removal. */
export async function reloadLinuxLaunchers(): Promise<void> {
  try {
    const { data } = await api.get<LinuxLauncher[]>("/linux-apps/launchers", {
      params: { languages: languages() },
    });
    syncLinuxLaunchers(Array.isArray(data) ? data : []);
  } catch {
    // No Linux apps on this machine, or not reachable now: Start keeps what it had.
  }
}

/** A file in one of Files' roots, for a Linux app to open. */
export type LinuxFile = { root: string; path: string };

/**
 * Start a launcher's program in this tab's session, or one of its desktop
 * actions (`actionId`), which starts the same way. With `file` the program
 * opens it (Open with); the backend refuses a path outside the user's home.
 */
export async function launchLinuxApp(appId: string, actionId?: string, file?: LinuxFile): Promise<void> {
  const id = appId.slice(LINUX_APP_PREFIX.length);
  const name = APP_REGISTRY.find((a) => a.id === appId)?.name ?? id;
  const path =
    actionId === undefined
      ? `/linux-apps/launchers/${encodeURIComponent(id)}/launch`
      : `/linux-apps/launchers/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionId)}/launch`;
  try {
    await api.post(
      path,
      file ? { session: desktopSessionId(), path: file.path, root: file.root } : { session: desktopSessionId() },
    );
  } catch (err) {
    const data = (err as { response?: { data?: { message?: unknown } } }).response?.data;
    notify({
      title: `${name} didn't start`,
      body: typeof data?.message === "string" ? data.message : "The request failed.",
      level: "error",
    });
  }
}
