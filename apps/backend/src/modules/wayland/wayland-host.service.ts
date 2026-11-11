import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, chmodSync, rmSync } from "fs";
import { createServer, type Server, type Socket } from "net";
import { join } from "path";
import type { Env } from "../../config/env.schema";
import { childEnv } from "../../child-env";
import { linuxAppsPaths, xwaylandBinary } from "../linux-apps/linux-apps.paths";
import {
  Decoder,
  encodeJson,
  PROTOCOL_VERSION,
  ProtocolError,
  type HostInbound,
  type HostOutbound,
} from "./wayland.protocol";

/** What one desktop session hears from the host. */
export interface SessionListener {
  message(message: HostOutbound): void;
  frame(body: Buffer): void;
  /** A packet of the session's sound: sequence number, then Opus. */
  audio(body: Buffer): void;
  /** The host exited or was never there; the session is gone. */
  gone(reason: string): void;
}

/**
 * The Wayland host process: one per machine, started when the first desktop
 * session opens and stopped with the backend.
 *
 * The backend listens on a control socket in a private directory under
 * `XDG_RUNTIME_DIR` and starts the host with its path; the host connects back
 * and the two speak the framed protocol in `wayland.protocol.ts`. Messages
 * for a session the host names go to that session's listener and nowhere
 * else.
 */
@Injectable()
export class WaylandHostService implements OnModuleDestroy {
  private readonly logger = new Logger(WaylandHostService.name);
  private child: ChildProcess | null = null;
  private server: Server | null = null;
  private conn: Socket | null = null;
  private decoder = new Decoder();
  /** Written before the host connected; sent once it does. */
  private queued: Buffer[] = [];
  private readonly sessions = new Map<string, SessionListener>();
  /** Each session's X display for X11 apps, as the host reserved it. */
  private readonly x11Displays = new Map<string, number>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * The X display (`DISPLAY=:<n>`) a session's X11 apps use, once the host
   * has opened the session; null before, or when it has none.
   */
  x11Display(session: string): number | null {
    return this.x11Displays.get(session) ?? null;
  }

  /**
   * Ask the host for a session's display, starting the host if needed.
   * Returns a reason when Linux apps can't run here at all.
   */
  open(session: string, width: number, height: number, ratio: number, listener: SessionListener): string | null {
    const failure = this.ensureStarted();
    if (failure) return failure;
    this.sessions.set(session, listener);
    this.send({ type: "session_open", session, width, height, ratio });
    return null;
  }

  close(session: string): void {
    this.x11Displays.delete(session);
    if (!this.sessions.delete(session)) return;
    this.send({ type: "session_close", session });
  }

  send(message: HostInbound): void {
    if (!this.child) return;
    const bytes = encodeJson(message);
    if (this.conn) this.conn.write(bytes);
    else this.queued.push(bytes);
  }

  private ensureStarted(): string | null {
    if (this.child) return null;
    const runtimeDir = process.env.XDG_RUNTIME_DIR;
    if (!runtimeDir) return "XDG_RUNTIME_DIR is not set";
    const dir = join(runtimeDir, "imbatranim-wayland");
    const controlPath = join(dir, "control.sock");
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      chmodSync(dir, 0o700);
      rmSync(controlPath, { force: true });
    } catch (err) {
      return `cannot prepare ${dir}: ${(err as Error).message}`;
    }

    const server = createServer((socket) => this.onConnection(socket));
    server.on("error", (err) => this.stop(`control socket: ${err.message}`));
    server.listen(controlPath);
    this.server = server;

    const bin = this.config.get("WAYLAND_HOST_BIN", { infer: true });
    const encoding = this.config.get("WAYLAND_HOST_ENCODING", { infer: true });
    const args = ["--control", controlPath, "--encoding", encoding];
    // X11 apps, through the Xwayland Nix installs with the first app that
    // speaks X11. The host checks for it when an X client connects.
    const nix = linuxAppsPaths();
    if (nix) args.push("--xwayland", xwaylandBinary(nix));
    const child = spawn(bin, args, {
      env: childEnv(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.child = child;
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (text: string) => {
      for (const line of text.split("\n")) if (line.trim()) this.logger.log(line.trim());
    });
    child.on("error", (err) => {
      if (this.child === child) this.stop(`cannot start ${bin}: ${err.message}`);
    });
    child.on("exit", (code, signal) => {
      if (this.child === child) this.stop(`exited (${signal ?? code})`);
    });
    this.logger.log(`Wayland host starting (${encoding})`);
    return null;
  }

  private onConnection(socket: Socket): void {
    if (this.conn) {
      socket.destroy();
      return;
    }
    this.conn = socket;
    // One connection, from the host we started; nobody else gets to dial in.
    this.server?.close();
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("error", () => this.stop("control socket error"));
    socket.on("close", () => this.stop("control socket closed"));
    for (const bytes of this.queued) socket.write(bytes);
    this.queued = [];
  }

  private onData(chunk: Buffer): void {
    let decoded;
    try {
      decoded = this.decoder.push(chunk);
    } catch (err) {
      const reason = err instanceof ProtocolError ? err.message : String(err);
      this.stop(`bad message from the host: ${reason}`);
      return;
    }
    for (const d of decoded) {
      if (d.kind === "frame") {
        this.sessions.get(d.session)?.frame(d.body);
        continue;
      }
      if (d.kind === "audio") {
        this.sessions.get(d.session)?.audio(d.body);
        continue;
      }
      const m = d.message;
      if (m.type === "hello") {
        if (m.version !== PROTOCOL_VERSION) {
          this.stop(`protocol version ${m.version}, expected ${PROTOCOL_VERSION}`);
          return;
        }
        this.logger.log("Wayland host connected");
        continue;
      }
      if (m.type === "session_ready") {
        const n = m.x11_display;
        if (typeof n === "number" && Number.isInteger(n) && n >= 0) this.x11Displays.set(m.session, n);
        else this.x11Displays.delete(m.session);
      }
      if ("session" in m) this.sessions.get(m.session)?.message(m);
    }
  }

  /** Tear everything down; every open session hears why. */
  private stop(reason: string): void {
    const child = this.child;
    if (!child && !this.server && !this.conn) return;
    this.logger.warn(`Wayland host stopped: ${reason}`);
    this.child = null;
    this.conn?.destroy();
    this.conn = null;
    this.server?.close();
    this.server = null;
    this.queued = [];
    this.decoder = new Decoder();
    this.x11Displays.clear();
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    const listeners = [...this.sessions.values()];
    this.sessions.clear();
    for (const l of listeners) l.gone(reason);
  }

  onModuleDestroy(): void {
    this.stop("shutdown");
  }
}
