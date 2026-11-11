import { MessageType, type Message } from "./wire";
import {
  CLOSED_BY_CALL,
  CLOSED_DISMISSED,
  MAX_BODY,
  NOTIFICATIONS,
  NotificationsServer,
  type ShownNotification,
} from "./notifications";

function setup() {
  const shown: ShownNotification[] = [];
  const closed: number[] = [];
  const signals: unknown[][] = [];
  const server = new NotificationsServer(
    (m) => signals.push([m.member, ...(m.body ?? [])]),
    { show: (n) => shown.push(n), close: (id) => closed.push(id) },
    "1.150.0",
  );
  return { server, shown, closed, signals };
}

const call = (
  member: string,
  signature?: string,
  body: unknown[] = [],
  iface: string = NOTIFICATIONS.interface,
): Message => ({
  type: MessageType.MethodCall,
  flags: 0,
  serial: 1,
  path: NOTIFICATIONS.path,
  interface: iface,
  member,
  signature,
  body,
});

const notify = (app: string, replaces: number, summary: string, body: string, actions: string[] = []) =>
  call("Notify", "susssasa{sv}i", [app, replaces, "firefox", summary, body, actions, [], 5000]);

describe("the notification service", () => {
  it("shows a Linux app's notification in the tab, under the app's name, and answers its id", () => {
    const { server, shown } = setup();
    expect(server.handle(notify("Firefox", 0, "Hi", "from a page"))).toEqual({
      signature: "u",
      body: [1],
    });
    expect(server.handle(notify("Firefox", 0, "Again", ""))).toEqual({
      signature: "u",
      body: [2],
    });
    expect(shown).toEqual([
      {
        id: 1,
        app: "Firefox",
        summary: "Hi",
        body: "from a page",
        hasDefault: false,
      },
      { id: 2, app: "Firefox", summary: "Again", body: "", hasDefault: false },
    ]);
  });

  it("keeps the id of a notification it replaces, and gives an unknown one a new id", () => {
    const { server, shown } = setup();
    server.handle(notify("App", 0, "Downloading", "10%"));
    expect(server.handle(notify("App", 1, "Downloading", "90%"))).toEqual({
      signature: "u",
      body: [1],
    });
    expect(server.handle(notify("App", 40, "Other", ""))).toEqual({
      signature: "u",
      body: [2],
    });
    expect(shown.map((n) => n.id)).toEqual([1, 1, 2]);
  });

  it("cuts text past its limits", () => {
    const { server, shown } = setup();
    server.handle(notify("App", 0, "S", "x".repeat(MAX_BODY + 50)));
    expect(shown[0].body).toHaveLength(MAX_BODY);
  });

  it("closes one when the app asks, takes it off the desktop and signals why", () => {
    const { server, closed, signals } = setup();
    server.handle(notify("App", 0, "S", ""));
    expect(server.handle(call("CloseNotification", "u", [1]))).toEqual({});
    expect(closed).toEqual([1]);
    expect(signals).toEqual([["NotificationClosed", 1, CLOSED_BY_CALL]]);
    // Closing it again, or one never shown, says nothing.
    server.handle(call("CloseNotification", "u", [1]));
    server.handle(call("CloseNotification", "u", [9]));
    expect(signals).toHaveLength(1);
  });

  it("tells the app once when the owner closes it in the OS", () => {
    const { server, closed, signals } = setup();
    server.handle(notify("App", 0, "S", ""));
    server.closedByUser(1);
    server.closedByUser(1);
    server.closedByUser(5);
    expect(signals).toEqual([["NotificationClosed", 1, CLOSED_DISMISSED]]);
    expect(closed).toEqual([]);
  });

  it("runs the default action on a click, then closes it as dismissed", () => {
    const { server, shown, signals } = setup();
    server.handle(notify("Firefox", 0, "Hi", "", ["default", "Open"]));
    expect(shown[0].hasDefault).toBe(true);
    server.actionByUser(1, "default");
    expect(signals).toEqual([
      ["ActionInvoked", 1, "default"],
      ["NotificationClosed", 1, CLOSED_DISMISSED],
    ]);
    // It is forgotten: a second click says nothing.
    server.actionByUser(1, "default");
    expect(signals).toHaveLength(2);
  });

  it("only closes a notification without a default action on a click", () => {
    const { server, shown, signals } = setup();
    server.handle(notify("App", 0, "S", "", ["reply", "Reply"]));
    expect(shown[0].hasDefault).toBe(false);
    server.actionByUser(1, "default");
    expect(signals).toEqual([["NotificationClosed", 1, CLOSED_DISMISSED]]);
  });

  it("ignores a click on an id it does not hold, and any key but default", () => {
    const { server, signals } = setup();
    server.handle(notify("App", 0, "S", "", ["default", "Open", "x", "X"]));
    server.actionByUser(9, "default");
    server.actionByUser(1, "x");
    expect(signals).toEqual([]);
  });

  it("writes ActionInvoked as (u, s)", () => {
    const sent: unknown[] = [];
    const server = new NotificationsServer((m) => sent.push(m), { show: () => undefined, close: () => undefined }, "1");
    server.handle(notify("A", 0, "S", "", ["default", "Open"]));
    server.actionByUser(1, "default");
    expect(sent[0]).toMatchObject({
      path: NOTIFICATIONS.path,
      interface: NOTIFICATIONS.interface,
      member: "ActionInvoked",
      signature: "us",
      body: [1, "default"],
    });
  });

  it("answers what it can do, who it is, and its introspection", () => {
    const { server } = setup();
    expect(server.handle(call("GetCapabilities"))).toEqual({
      signature: "as",
      body: [["actions", "body"]],
    });
    expect(server.handle(call("GetServerInformation"))).toEqual({
      signature: "ssss",
      body: ["ImbatranimOS", "imbatranim", "1.150.0", "1.2"],
    });
    const xml = server.handle(call("Introspect", undefined, [], "org.freedesktop.DBus.Introspectable"));
    expect(xml).toMatchObject({ signature: "s" });
    expect(server.handle(call("Ping", undefined, [], "org.freedesktop.DBus.Peer"))).toEqual({});
  });

  it("refuses wrong arguments, and leaves other paths and methods alone", () => {
    const { server, shown } = setup();
    expect(server.handle(call("Notify", "s", ["x"]))).toMatchObject({
      error: "org.freedesktop.DBus.Error.InvalidArgs",
    });
    expect(shown).toEqual([]);
    expect(server.handle(call("Frobnicate"))).toBeUndefined();
    expect(server.handle({ ...call("GetCapabilities"), path: "/other" })).toBeUndefined();
  });
});
