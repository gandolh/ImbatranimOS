import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { BUS, DbusConnection } from "./dbus/connection";
import { NOTIFICATIONS, NotificationsServer } from "./dbus/notifications";
import { SETTINGS, APPEARANCE_PREF, SettingsServer } from "./dbus/settings";
import { PrefsService } from "../prefs/prefs.service";
import { SessionApps } from "../wayland/session-apps";
import { WaylandGateway } from "../wayland/wayland.gateway";
import { sessionBusPath } from "./session-bus.paths";

/** RequestName flag: fail rather than wait in the queue for the name. */
const DO_NOT_QUEUE = 4;
/** RequestName reply: this connection now owns the name. */
const PRIMARY_OWNER = 1;
/** How long the bus gets to say it's listening. */
const START_TIMEOUT_MS = 5_000;

const isU32 = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 0xffffffff;

/**
 * A D-Bus session bus for each desktop session (one tab), and the OS's
 * notification service on it.
 *
 * The bus starts with the session, from the image's `dbus-daemon` (Alpine's,
 * about 0.7 MB). It runs in its own process group, recorded with the
 * session's apps, so it sleeps with them under the cover screen and stops
 * when the session ends. Every app the session starts, from Start or a
 * Terminal, gets its address (`terminalEnv`): Firefox keeps one instance and
 * opens New Window in it, and apps can notify. Nothing is shared between
 * sessions, and there is no system bus.
 */
@Injectable()
export class SessionBusService implements OnModuleInit {
  private readonly logger = new Logger(SessionBusService.name);
  private readonly servers = new Map<string, NotificationsServer>();
  private readonly settings = new Map<string, SettingsServer>();
  private unavailable = false;

  constructor(
    private readonly gateway: WaylandGateway,
    private readonly apps: SessionApps,
    private readonly prefs: PrefsService,
  ) {}

  onModuleInit(): void {
    // The desktop's mode or accent changed: every open app restyles.
    this.prefs.onChange((key, value) => {
      if (key !== APPEARANCE_PREF) return;
      for (const server of this.settings.values()) server.update(value);
    });
    this.gateway.addSessionHooks({
      started: (session) => void this.start(session),
      tabMessage: (session, m) => this.fromTab(session, m),
    });
  }

  private async start(session: string): Promise<void> {
    const runtimeDir = process.env.XDG_RUNTIME_DIR;
    if (!runtimeDir || this.unavailable) return;
    const path = sessionBusPath(runtimeDir, session);
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      // A bus that died with SIGKILL leaves its socket behind.
      rmSync(path, { force: true });
    } catch (e) {
      this.logger.warn(`No session bus: ${(e as Error).message}`);
      return;
    }
    const ready = await this.startDaemon(session, path);
    if (!ready) return;
    try {
      await this.serveNotifications(session, path);
    } catch (e) {
      this.logger.warn(`Session bus without notifications: ${(e as Error).message}`);
    }
    try {
      await this.serveSettings(session, path);
    } catch (e) {
      this.logger.warn(`Session bus without appearance settings: ${(e as Error).message}`);
    }
  }

  /** Start the session's `dbus-daemon`; true once it listens. */
  private startDaemon(session: string, path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(
        "dbus-daemon",
        ["--session", `--address=unix:path=${path}`, "--nofork", "--nopidfile", "--print-address=1"],
        { detached: true, stdio: ["ignore", "pipe", "ignore"] },
      );
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        this.logger.warn("The session bus did not start in time");
        child.kill("SIGTERM");
        done(false);
      }, START_TIMEOUT_MS);
      child.once("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") {
          // An image without dbus-daemon: apps run without a bus, as before.
          this.unavailable = true;
          this.logger.warn("No dbus-daemon in this image: no session bus");
        }
        done(false);
      });
      child.once("spawn", () => {
        // Its group sleeps under the cover screen and ends with the session.
        this.apps.record(session, child.pid!);
        child.once("exit", () => {
          this.apps.exited(session, child.pid!);
          done(false);
        });
      });
      // It prints its address once it listens.
      child.stdout?.once("data", () => done(true));
      child.unref();
    });
  }

  private async serveNotifications(session: string, path: string): Promise<void> {
    const bus = await DbusConnection.open(path, process.getuid?.() ?? 0);
    const server = new NotificationsServer(
      (m) => bus.signal(m),
      {
        show: (n) => this.gateway.sendToTab(session, { type: "notification", ...n }),
        close: (id) => this.gateway.sendToTab(session, { type: "notification_close", id }),
      },
      process.env.IMAGE_VERSION ?? "1",
    );
    bus.onMethodCall((call) => server.handle(call));
    bus.onClose(() => {
      if (this.servers.get(session) === server) this.servers.delete(session);
    });
    const reply = await bus.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: "RequestName",
      signature: "su",
      body: [NOTIFICATIONS.name, DO_NOT_QUEUE],
    });
    if (reply.body[0] !== PRIMARY_OWNER) {
      bus.close();
      throw new Error(`${NOTIFICATIONS.name} is taken`);
    }
    this.servers.set(session, server);
  }

  /** Answer the Settings portal with the desktop's mode and accent. */
  private async serveSettings(session: string, path: string): Promise<void> {
    const bus = await DbusConnection.open(path, process.getuid?.() ?? 0);
    const server = new SettingsServer((m) => bus.signal(m), this.prefs.get(APPEARANCE_PREF));
    bus.onMethodCall((call) => server.handle(call));
    bus.onClose(() => {
      if (this.settings.get(session) === server) this.settings.delete(session);
    });
    const reply = await bus.call({
      destination: BUS.name,
      path: BUS.path,
      interface: BUS.interface,
      member: "RequestName",
      signature: "su",
      body: [SETTINGS.name, DO_NOT_QUEUE],
    });
    if (reply.body[0] !== PRIMARY_OWNER) {
      bus.close();
      throw new Error(`${SETTINGS.name} is taken`);
    }
    this.settings.set(session, server);
  }

  /** The owner closed or clicked a Linux app's notification in the OS. */
  private fromTab(session: string, m: Record<string, unknown>): boolean {
    if (m.type === "notification_action") {
      if (isU32(m.id) && typeof m.key === "string" && m.key.length <= 64) {
        this.servers.get(session)?.actionByUser(m.id, m.key);
      }
      return true;
    }
    if (m.type !== "notification_closed") return false;
    if (isU32(m.id)) this.servers.get(session)?.closedByUser(m.id);
    return true;
  }
}
