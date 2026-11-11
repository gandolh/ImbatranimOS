import { useNotificationStore } from "../../shared/store/notificationStore";
import { useWindowStore } from "../../shared/store/windowStore";
import { registerNotificationActivation } from "../../shared/components/notifications/activation";
import { LINUX_APP_PREFIX } from "./kind";

/**
 * A Linux app's notifications, arriving over the session's bus
 * (org.freedesktop.Notifications, answered by the backend), shown as
 * ordinary OS notifications. Closing one in the OS (removing it from the
 * notification centre) tells the app; the app closing one takes it off. A
 * click on one that has a `default` action runs it (`notification_action`),
 * and brings the app's window forward when it has exactly one.
 */

export type LinuxNotification = {
  id: number;
  app: string;
  summary: string;
  body: string;
  /** The app gave it a `default` action: a click runs it. */
  hasDefault?: boolean;
};

type Send = (message: object) => void;

export class LinuxNotifications {
  /** The bus's id → the OS notification showing it. */
  private readonly shown = new Map<number, string>();
  /** OS notifications taken down by the app, whose removal tells nobody. */
  private readonly quiet = new Set<string>();
  /** The bus's id → the app's name, for finding its window on a click. */
  private readonly apps = new Map<number, string>();
  private readonly send: Send;
  private readonly unsubscribe: () => void;
  private readonly unregister: () => void;

  constructor(send: Send) {
    this.send = send;
    this.unsubscribe = useNotificationStore.subscribe((state) => this.noticeRemovals(state.notifications));
    this.unregister = registerNotificationActivation("linux", (item) => {
      if (item.source?.kind === "linux") this.activate(item.source.id, item.id);
    });
  }

  /** Show one, or replace the one it updates. */
  show(n: LinuxNotification): void {
    const previous = this.shown.get(n.id);
    if (previous) this.takeDown(previous);
    const summary = n.summary.trim();
    const app = n.app.trim();
    const title = app && summary ? `${app}: ${summary}` : summary || app || "Linux app";
    const osId = useNotificationStore.getState().notify({
      title,
      body: n.body.trim() || undefined,
      level: "info",
      ...(n.hasDefault ? { source: { kind: "linux" as const, id: n.id } } : {}),
    });
    this.shown.set(n.id, osId);
    this.apps.set(n.id, app);
  }

  /** The app closed it. */
  close(id: number): void {
    const osId = this.shown.get(id);
    if (!osId) return;
    this.shown.delete(id);
    this.apps.delete(id);
    this.takeDown(osId);
  }

  /**
   * The owner clicked the notification: run its `default` action, which the
   * backend answers by closing it. Only a notification this session still
   * shows counts; a history entry from an earlier session does nothing.
   */
  private activate(id: number, osId: string): void {
    if (this.shown.get(id) !== osId) return;
    const app = this.apps.get(id) ?? "";
    this.shown.delete(id);
    this.apps.delete(id);
    this.send({ type: "notification_action", id, key: "default" });
    this.raise(app);
  }

  /** Raise the app's window when it has exactly one; else leave focus alone. */
  private raise(app: string): void {
    const want = LINUX_APP_PREFIX + app.trim().toLowerCase();
    if (want === LINUX_APP_PREFIX) return;
    const store = useWindowStore.getState();
    const matches = store.windows.filter((w) => w.appId.toLowerCase() === want);
    if (matches.length !== 1) return;
    store.focusWindow(matches[0].id);
    if (!matches[0].isVisible) store.showWindow(matches[0].id);
  }

  /** A new session: the old one's notifications can't be told anything. */
  forget(): void {
    this.shown.clear();
    this.apps.clear();
    this.quiet.clear();
  }

  dispose(): void {
    this.unsubscribe();
    this.unregister();
  }

  private takeDown(osId: string): void {
    this.quiet.add(osId);
    useNotificationStore.getState().remove(osId);
  }

  private noticeRemovals(notifications: readonly { id: string }[]): void {
    if (this.shown.size === 0 && this.quiet.size === 0) return;
    const present = new Set(notifications.map((n) => n.id));
    for (const [busId, osId] of this.shown) {
      if (present.has(osId)) continue;
      this.shown.delete(busId);
      this.apps.delete(busId);
      if (!this.quiet.delete(osId)) this.send({ type: "notification_closed", id: busId });
    }
    for (const osId of this.quiet) if (!present.has(osId)) this.quiet.delete(osId);
  }
}

/**
 * The kernel killed a Linux app because the machine ran out of memory (the
 * container's cap on the VPS): its windows have closed, and this says why.
 */
export function notifyAppStopped(app: string): void {
  useNotificationStore.getState().notify({
    title: `${app.trim() || "A Linux app"} was stopped`,
    body: "The machine ran out of memory. Your other apps and the desktop are still running.",
    level: "warning",
  });
}
