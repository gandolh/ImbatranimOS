import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AddressInfo, Server } from "net";
import { WebSocket, type RawData } from "ws";
import { PtyGateway } from "../pty/pty.gateway";
import { LocalIdentityService } from "../auth/ws-auth";
import type { Caller } from "../identity/identity.types";
import { UpgradeRoutes } from "../../upgrade-routes";
import { WaylandGateway } from "./wayland.gateway";
import { SessionApps } from "./session-apps";
import { WaylandHostService, type SessionListener } from "./wayland-host.service";
import type { HostInbound } from "./wayland.protocol";

const SESSION = "abcdefghijklmnop";
const SHAPE = {
  scale: 1,
  geometry: { x: 0, y: 0, width: 700, height: 474 },
  decorations: "server" as const,
  min_width: 0,
  min_height: 0,
  max_width: 0,
  max_height: 0,
};

/** Stands in for the host process: records what the gateway asks of it. */
class FakeHost {
  listeners = new Map<string, SessionListener>();
  sent: HostInbound[] = [];
  opened: {
    session: string;
    width: number;
    height: number;
    ratio: number;
  }[] = [];
  closed: string[] = [];
  unavailable: string | null = null;

  open(session: string, width: number, height: number, ratio: number, listener: SessionListener) {
    if (this.unavailable) return this.unavailable;
    this.opened.push({ session, width, height, ratio });
    this.listeners.set(session, listener);
    return null;
  }
  close(session: string) {
    this.closed.push(session);
    this.listeners.delete(session);
  }
  send(m: HostInbound) {
    this.sent.push(m);
  }
}

describe("WaylandGateway", () => {
  let app: INestApplication<Server>;
  let port: number;
  let host: FakeHost;
  const caller: Caller = { subject: "s", username: "owner", sid: "sid" };

  beforeEach(async () => {
    host = new FakeHost();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PtyGateway,
        WaylandGateway,
        UpgradeRoutes,
        { provide: WaylandHostService, useValue: host },
        SessionApps,
        {
          provide: LocalIdentityService,
          useValue: {
            authenticate: (cookie: string | undefined) =>
              cookie?.includes("imb_session=good") ? Promise.resolve(caller) : Promise.reject(new Error("no session")),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => (k === "FRONTEND_URL" ? "http://localhost:5173" : undefined),
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // A reload's grace and SIGTERM's turn, shortened for the tests.
    const gateway = moduleRef.get(WaylandGateway);
    gateway.graceMs = 150;
    gateway.killAfterMs = 50;
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterEach(async () => {
    await app.close();
  });

  const url = (q: string) => `ws://127.0.0.1:${port}/api/wayland?${q}`;
  const signedIn = { headers: { cookie: "imb_session=good" } };

  /** Collect a socket's messages and its close. */
  function open(q: string, opts: object = signedIn) {
    const ws = new WebSocket(url(q), opts);
    const messages: { text?: unknown; binary?: Buffer }[] = [];
    ws.on("message", (data: RawData, isBinary: boolean) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      messages.push(isBinary ? { binary: buf } : { text: JSON.parse(buf.toString("utf8")) });
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    const opened = new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("unexpected-response", (_req, res) => reject(new Error(String(res.statusCode))));
      ws.on("error", reject);
    });
    return { ws, messages, closed, opened };
  }

  const until = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(check()).toBe(true);
  };

  it("refuses an upgrade without a sign-in", async () => {
    const c = open(`session=${SESSION}`, {});
    await expect(c.opened).rejects.toThrow("401");
    expect(host.opened).toEqual([]);
  });

  it("refuses a missing or unsafe session id before checking the sign-in", async () => {
    await expect(open("width=10").opened).rejects.toThrow("400");
    await expect(open("session=..%2F..%2Fetc").opened).rejects.toThrow("400");
  });

  it("opens the session's display at the tab's viewport and relays its windows", async () => {
    const c = open(`session=${SESSION}&width=1280&height=720&ratio=2`);
    await c.opened;
    await until(() => host.opened.length === 1);
    expect(host.opened[0]).toEqual({
      session: SESSION,
      width: 1280,
      height: 720,
      ratio: 2,
    });

    const l = host.listeners.get(SESSION)!;
    l.message({
      type: "toplevel_created",
      session: SESSION,
      toplevel: 3,
      title: "foot",
      app_id: "foot",
      width: 700,
      height: 474,
      ...SHAPE,
    });
    const body = Buffer.alloc(14);
    body.writeUInt32LE(3, 0);
    l.frame(body);
    await until(() => c.messages.length === 3);
    // A new session says so first.
    expect(c.messages.shift()?.text).toEqual({
      type: "session",
      resumed: false,
    });
    expect(c.messages[0].text).toEqual({
      type: "toplevel_created",
      toplevel: 3,
      title: "foot",
      app_id: "foot",
      width: 700,
      height: 474,
      ...SHAPE,
    });
    expect(c.messages[1].binary?.[0]).toBe(2);
    expect(c.messages[1].binary?.subarray(1)).toEqual(body);
    // The socket drained at once, so the window may send its next frame.
    expect(host.sent).toContainEqual({
      type: "frame_ack",
      session: SESSION,
      toplevel: 3,
    });

    c.ws.send(JSON.stringify({ type: "viewport", width: 800, height: 600, ratio: 1.5 }));
    await until(() => host.sent.some((m) => m.type === "output"));
    expect(host.sent).toContainEqual({
      type: "output",
      session: SESSION,
      width: 800,
      height: 600,
      ratio: 1.5,
    });

    c.ws.close();
    await until(() => host.closed.includes(SESSION));
  });

  it("sends the session's sound as it comes, with no acks", async () => {
    const c = open(`session=${SESSION}`);
    await c.opened;
    await until(() => host.listeners.has(SESSION));
    const body = Buffer.from([7, 0, 0, 0, 0xfc, 0xff, 0xfe]);
    host.listeners.get(SESSION)!.audio(body);
    await until(() => c.messages.some((m) => m.binary));
    const sound = c.messages.find((m) => m.binary)!.binary!;
    expect(sound[0]).toBe(3);
    expect(sound.subarray(1)).toEqual(body);
    expect(host.sent.some((m) => m.type === "frame_ack")).toBe(false);
    c.ws.close();
    await until(() => host.closed.includes(SESSION));
  });

  it("passes the tab's input to the host, checked, with the session", async () => {
    const c = open(`session=${SESSION}`);
    await c.opened;
    await until(() => host.listeners.has(SESSION));
    for (const m of [
      { type: "focus", toplevel: 3 },
      { type: "pointer_motion", toplevel: 3, x: 10.5, y: 20 },
      { type: "pointer_button", toplevel: 3, button: 0x110, pressed: true },
      { type: "pointer_button", toplevel: 3, button: 1, pressed: true },
      { type: "key", keycode: 30, pressed: true },
      { type: "key", keycode: "a", pressed: true },
      {
        type: "configure",
        toplevel: 3,
        width: 800,
        height: 600,
        maximized: false,
      },
      { type: "close", toplevel: 3 },
      { type: "run", command: "rm -rf ~" },
    ]) {
      c.ws.send(JSON.stringify(m));
    }
    await until(() => host.sent.some((m) => m.type === "close"));
    expect(host.sent.map((m) => m.type)).toEqual([
      "focus",
      "pointer_motion",
      "pointer_button",
      "key",
      "configure",
      "close",
    ]);
    expect(host.sent.every((m) => m.session === SESSION)).toBe(true);
    c.ws.close();
    await c.closed;
  });

  it("keeps one socket per session: a second one is told to pick a new id", async () => {
    const first = open(`session=${SESSION}`);
    await first.opened;
    const second = open(`session=${SESSION}`);
    expect((await second.closed).code).toBe(4409);
    expect(host.opened).toHaveLength(1);
    expect(first.ws.readyState).toBe(WebSocket.OPEN);
    first.ws.close();
    await first.closed;
  });

  it("keeps a session through a reload, and announces its windows again", async () => {
    const first = open(`session=${SESSION}&width=1000&height=700`);
    await first.opened;
    await until(() => host.listeners.has(SESSION));
    first.ws.close();
    await first.closed;
    const again = open(`session=${SESSION}&width=1200&height=800`);
    await again.opened;
    await until(() => host.sent.some((m) => m.type === "resync"));
    expect(host.opened).toHaveLength(1);
    expect(host.closed).not.toContain(SESSION);
    // A tab that doesn't say its ratio gets a scale-1 output.
    expect(host.sent).toContainEqual({
      type: "output",
      session: SESSION,
      width: 1200,
      height: 800,
      ratio: 1,
    });
    // The reloaded tab is told the session resumed, then gets its windows.
    host.listeners.get(SESSION)!.message({ type: "toplevel_destroyed", session: SESSION, toplevel: 9 });
    await until(() => again.messages.length > 1);
    expect(again.messages.shift()?.text).toEqual({
      type: "session",
      resumed: true,
    });
    expect(again.messages[0].text).toEqual({
      type: "toplevel_destroyed",
      toplevel: 9,
    });
    again.ws.close();
    await again.closed;
  });

  it("lets a reload's socket take over when the old one closes after it arrived", async () => {
    const old = open(`session=${SESSION}`);
    await old.opened;
    await until(() => host.listeners.has(SESSION));
    const fresh = open(`session=${SESSION}`);
    await fresh.opened;
    old.ws.close();
    await until(() => host.sent.some((m) => m.type === "resync"));
    expect(fresh.ws.readyState).toBe(WebSocket.OPEN);
    expect(host.opened).toHaveLength(1);
    fresh.ws.close();
    await fresh.closed;
  });

  it("ends the session once the grace period runs out", async () => {
    const c = open(`session=${SESSION}`);
    await c.opened;
    await until(() => host.listeners.has(SESSION));
    c.ws.close();
    await c.closed;
    expect(host.closed).not.toContain(SESSION);
    await until(() => host.closed.includes(SESSION));
  });

  it("freezes the apps under the cover screen and wakes them after, without forwarding the cover", async () => {
    const c = open(`session=${SESSION}`);
    await c.opened;
    await until(() => host.listeners.has(SESSION));
    c.ws.send(JSON.stringify({ type: "cover", covered: true }));
    c.ws.send(JSON.stringify({ type: "cover", covered: true }));
    c.ws.send(JSON.stringify({ type: "visibility", visible: false }));
    c.ws.send(JSON.stringify({ type: "toplevel_visible", toplevel: 2, visible: false }));
    c.ws.send(JSON.stringify({ type: "cover", covered: false }));
    await until(() => host.sent.filter((m) => m.type === "freeze").length === 2);
    expect(host.sent.filter((m) => m.type !== "output")).toEqual([
      { type: "freeze", session: SESSION, frozen: true },
      { type: "visibility", session: SESSION, visible: false },
      {
        type: "toplevel_visible",
        session: SESSION,
        toplevel: 2,
        visible: false,
      },
      { type: "freeze", session: SESSION, frozen: false },
    ]);
    c.ws.close();
    await c.closed;
  });

  it("tells the tab when Linux apps are unavailable", async () => {
    host.unavailable = "XDG_RUNTIME_DIR is not set";
    const c = open(`session=${SESSION}`);
    const { code } = await c.closed;
    expect(code).toBe(4503);
    expect(c.messages[0].text).toEqual({
      type: "unavailable",
      reason: "XDG_RUNTIME_DIR is not set",
    });
  });

  it("closes the socket when the host goes away", async () => {
    const c = open(`session=${SESSION}`);
    await c.opened;
    await until(() => host.listeners.has(SESSION));
    host.listeners.get(SESSION)!.gone("exited (1)");
    expect((await c.closed).code).toBe(4503);
  });
});
