import type { HandlerResult } from './connection';
import type { Message } from './wire';

/**
 * `org.freedesktop.Notifications` on a session's bus: a Linux app's
 * notification becomes an ordinary OS notification in the tab, and closing
 * it there tells the app. Plain text only (no `body-markup`).
 *
 * It advertises `actions` though it invokes none yet: Firefox sends web
 * notifications (which carry a `default` action, the click) to a server
 * only when it has `actions`, and shows its own popup otherwise. A click on
 * the OS notification does nothing for now.
 *
 * https://specifications.freedesktop.org/notification-spec/latest/
 */

export const NOTIFICATIONS = {
  name: 'org.freedesktop.Notifications',
  path: '/org/freedesktop/Notifications',
  interface: 'org.freedesktop.Notifications',
} as const;

/** NotificationClosed reasons. */
export const CLOSED_EXPIRED = 1;
export const CLOSED_DISMISSED = 2;
export const CLOSED_BY_CALL = 3;

/** Longer text is cut: the OS shows a toast, not a document. */
export const MAX_SUMMARY = 200;
export const MAX_BODY = 2000;

/** What the tab gets for each notification. */
export type ShownNotification = {
  id: number;
  app: string;
  summary: string;
  body: string;
};

export type NotificationsTab = {
  show(n: ShownNotification): void;
  close(id: number): void;
};

export type SignalSender = (m: {
  path: string;
  interface: string;
  member: string;
  signature?: string;
  body?: unknown[];
}) => void;

const INTROSPECTION = `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.freedesktop.Notifications">
    <method name="GetCapabilities"><arg direction="out" type="as"/></method>
    <method name="Notify">
      <arg direction="in" type="s"/><arg direction="in" type="u"/><arg direction="in" type="s"/>
      <arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="in" type="as"/>
      <arg direction="in" type="a{sv}"/><arg direction="in" type="i"/><arg direction="out" type="u"/>
    </method>
    <method name="CloseNotification"><arg direction="in" type="u"/></method>
    <method name="GetServerInformation">
      <arg direction="out" type="s"/><arg direction="out" type="s"/>
      <arg direction="out" type="s"/><arg direction="out" type="s"/>
    </method>
    <signal name="NotificationClosed"><arg type="u"/><arg type="u"/></signal>
    <signal name="ActionInvoked"><arg type="u"/><arg type="s"/></signal>
  </interface>
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect"><arg direction="out" type="s"/></method>
  </interface>
  <interface name="org.freedesktop.DBus.Peer">
    <method name="Ping"/>
  </interface>
</node>
`;

const clip = (s: unknown, max: number) =>
  typeof s === 'string' ? s.slice(0, max) : '';

export class NotificationsServer {
  private nextId = 1;
  private readonly open = new Set<number>();
  private readonly signal: SignalSender;
  private readonly tab: NotificationsTab;
  private readonly version: string;

  constructor(signal: SignalSender, tab: NotificationsTab, version: string) {
    this.signal = signal;
    this.tab = tab;
    this.version = version;
  }

  /** Answer a method call on the bus, or undefined for one this isn't. */
  handle(call: Message): HandlerResult | undefined {
    if (call.path !== NOTIFICATIONS.path) return undefined;
    switch (`${call.interface ?? NOTIFICATIONS.interface}.${call.member}`) {
      case 'org.freedesktop.Notifications.GetCapabilities':
        return { signature: 'as', body: [['actions', 'body']] };
      case 'org.freedesktop.Notifications.GetServerInformation':
        return {
          signature: 'ssss',
          body: ['ImbatranimOS', 'imbatranim', this.version, '1.2'],
        };
      case 'org.freedesktop.Notifications.Notify':
        return this.notify(call);
      case 'org.freedesktop.Notifications.CloseNotification':
        if (call.signature !== 'u') return badArgs('CloseNotification', 'u');
        this.closeByCall(call.body[0] as number);
        return {};
      case 'org.freedesktop.DBus.Introspectable.Introspect':
        return { signature: 's', body: [INTROSPECTION] };
      case 'org.freedesktop.DBus.Peer.Ping':
        return {};
      default:
        return undefined;
    }
  }

  private notify(call: Message): HandlerResult {
    if (call.signature !== 'susssasa{sv}i') {
      return badArgs('Notify', 'susssasa{sv}i');
    }
    const [app, replaces, , summary, body] = call.body as [
      string,
      number,
      string,
      string,
      string,
    ];
    // A replacement keeps its id, as the spec asks; an unknown one is new.
    const id =
      replaces > 0 && this.open.has(replaces) ? replaces : this.allocate();
    this.open.add(id);
    this.tab.show({
      id,
      app: clip(app, 100),
      summary: clip(summary, MAX_SUMMARY),
      body: clip(body, MAX_BODY),
    });
    return { signature: 'u', body: [id] };
  }

  private allocate(): number {
    const id = this.nextId;
    this.nextId = this.nextId >= 0xffffffff ? 1 : this.nextId + 1;
    return id;
  }

  /** The app closed it: take it off the desktop and say so. */
  private closeByCall(id: number): void {
    if (!this.open.delete(id)) return;
    this.tab.close(id);
    this.closed(id, CLOSED_BY_CALL);
  }

  /** The owner closed it in the OS. */
  closedByUser(id: number): void {
    if (this.open.delete(id)) this.closed(id, CLOSED_DISMISSED);
  }

  private closed(id: number, reason: number): void {
    this.signal({
      path: NOTIFICATIONS.path,
      interface: NOTIFICATIONS.interface,
      member: 'NotificationClosed',
      signature: 'uu',
      body: [id, reason],
    });
  }
}

function badArgs(member: string, signature: string): HandlerResult {
  return {
    error: 'org.freedesktop.DBus.Error.InvalidArgs',
    message: `${member} takes (${signature})`,
  };
}
