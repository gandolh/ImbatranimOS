import type { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { brotliCompressSync } from "zlib";
import type { WaylandGateway } from "../wayland/wayland.gateway";
import { SessionApps } from "../wayland/session-apps";
import { LinuxAppUpdatesService } from "./linux-app-updates.service";
import { LinuxAppsService } from "./linux-apps.service";
import type { Pin } from "./pins";

// Every Nix command goes through these; a small fake Nix answers them.
const mockSpawn = jest.fn<ChildProcess, unknown[]>();
const mockRun = jest.fn<Promise<{ stdout: string; stderr: string }>, unknown[]>();
jest.mock("child_process", (): typeof import("child_process") => {
  const actual = jest.requireActual<typeof import("child_process")>("child_process");
  const { promisify } = jest.requireActual<typeof import("util")>("util");
  const execFile = ((...args: unknown[]) => (actual.execFile as (...a: unknown[]) => unknown)(...args)) as never;
  Object.assign(execFile, {
    [promisify.custom]: (...args: unknown[]) => mockRun(...args),
  });
  return {
    ...actual,
    spawn: ((...args: unknown[]) => mockSpawn(...args)) as never,
    execFile,
  };
});

const SESSION = "abcdefghijklmnop";
const A: Pin = {
  release: "nixos-26.05",
  snapshot: "nixos-26.05.13446.7dcdd87373d7",
  commit: "7dcdd87373d72e7a2173e4db02e20d3d7f495cfd",
};
const B: Pin = {
  release: "nixos-26.05",
  snapshot: "nixos-26.05.13627.c56a87d8e41c",
  commit: "c56a87d8e41ce69bd2af57eb35dcc117a9dfca33",
};
const C: Pin = {
  release: "nixos-26.05",
  snapshot: `nixos-26.05.13700.${"d".repeat(12)}`,
  commit: "d".repeat(40),
};
const U: Pin = {
  release: "nixos-26.11",
  snapshot: `nixos-26.11.10.${"e".repeat(12)}`,
  commit: "e".repeat(40),
};

/** A release list holding these packages at these versions. */
function packageList(versions: Record<string, string>): Buffer {
  const packages = Object.fromEntries(
    Object.entries(versions).map(([attr, version]) => [
      attr,
      {
        pname: attr,
        version,
        system: "x86_64-linux",
        meta: { description: attr },
      },
    ]),
  );
  return brotliCompressSync(Buffer.from(JSON.stringify({ packages, version: 2 })));
}

const LISTS: Record<string, Buffer> = {
  [A.commit]: packageList({ firefox: "159.0", xterm: "410" }),
  [B.commit]: packageList({ firefox: "159.0.1", xterm: "410" }),
  [C.commit]: packageList({ firefox: "159.0.2", xterm: "411" }),
  [U.commit]: packageList({ firefox: "160.0", xterm: "412" }),
};

function machine() {
  const root = mkdtempSync(join(tmpdir(), "linux-updates-"));
  const indexDir = join(root, "index");
  const profiles = join(root, "state", "profiles");
  mkdirSync(indexDir, { recursive: true });
  mkdirSync(profiles, { recursive: true });
  writeFileSync(join(indexDir, "git-revision"), A.commit + "\n");
  writeFileSync(join(indexDir, "packages.json.br"), LISTS[A.commit]);
  writeFileSync(
    join(root, "pin.env"),
    `NIXPKGS_RELEASE=${A.release}\nNIXPKGS_SNAPSHOT=${A.snapshot}\nNIXPKGS_COMMIT=${A.commit}\n`,
  );
  // Generation 1 holds the apps installed at the image's pin.
  symlinkSync(join(root, "store-profile-1"), join(profiles, "profile-1-link"));
  symlinkSync("profile-1-link", join(profiles, "profile"));
  symlinkSync(join(profiles, "profile"), join(root, "state", "profile"));
  return {
    root,
    profiles,
    paths: {
      indexDir,
      pinFile: join(root, "pin.env"),
      profile: join(root, "state", "profile"),
      cacheDir: join(root, "cache"),
      store: join(root, "store"),
      xwaylandProfile: join(profiles, "imbatranim-xwayland"),
    },
  };
}

/** A command that ends with `code` on the next turn. */
function finishing(code: number): ChildProcess {
  const child = Object.assign(new EventEmitter(), {
    pid: 5151,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  setImmediate(() => child.emit("close", code, null));
  return child as unknown as ChildProcess;
}

describe("LinuxAppUpdatesService", () => {
  let m: ReturnType<typeof machine>;
  let apps: LinuxAppsService;
  let updates: LinuxAppUpdatesService;
  /** Where the user registry points `nixpkgs`, as the fake Nix keeps it. */
  let registry: string | null;
  /** The channels, as NixOS would answer them. */
  let channels: Record<string, Pin>;
  /** A command that fails, as `cmd args…`. */
  let failing: RegExp | null;

  const generationOf = (name: string) => Number(/-(\d+)-link$/.exec(readlinkSync(join(m.profiles, name)))?.[1]);
  const generations = (name: string) =>
    readdirSync(m.profiles)
      .map((f) => new RegExp(`^${name}-(\\d+)-link$`).exec(f)?.[1])
      .filter(Boolean)
      .map(Number)
      .sort();
  const setGeneration = (name: string, n: number) => {
    const link = join(m.profiles, `${name}-${n}-link`);
    // The links point at store paths that aren't there: lstat, not exists.
    if (!lstatSync(link, { throwIfNoEntry: false })) symlinkSync(join(m.root, `store-${name}-${n}`), link);
    unlinkSync(join(m.profiles, name));
    symlinkSync(`${name}-${n}-link`, join(m.profiles, name));
  };

  /** The Nix commands the jobs ran, as `cmd args…`. */
  const commands = () =>
    mockSpawn.mock.calls.map((c) => [c[0], ...(c[1] as string[])].join(" ").replaceAll(m.root, "<root>"));

  beforeEach(() => {
    m = machine();
    registry = null;
    failing = null;
    channels = { "nixos-26.05": B };
    mockSpawn.mockImplementation((cmd: unknown, a: unknown) => {
      const args = a as string[];
      const line = [cmd, ...args].join(" ");
      if (failing?.test(line)) return finishing(1);
      const at = args.indexOf("--profile");
      const name = at >= 0 && args[at + 1] === m.paths.xwaylandProfile ? "imbatranim-xwayland" : "profile";
      if (args[0] === "registry" && args[1] === "add") registry = args[3];
      if (args[0] === "registry" && args[1] === "remove") registry = null;
      if (args[0] === "profile" && args[1] === "upgrade") setGeneration(name, Math.max(...generations(name)) + 1);
      if (args[0] === "profile" && args[1] === "rollback") setGeneration(name, Number(args[args.indexOf("--to") + 1]));
      return finishing(0);
    });
    mockRun.mockImplementation((cmd: unknown, args: unknown) => {
      const a = args as string[];
      if (a[0] === "profile" && a[1] === "list")
        return Promise.resolve({
          stdout: JSON.stringify({
            elements: Object.fromEntries(
              ["firefox", "xterm"].map((n) => [
                n,
                {
                  attrPath: `legacyPackages.x86_64-linux.${n}`,
                  originalUrl: "flake:nixpkgs",
                  storePaths: [`/nix/store/abc-${n}-1`],
                },
              ]),
            ),
            version: 3,
          }),
          stderr: "",
        });
      // `nix path-info`: no app speaks X11.
      return Promise.resolve({ stdout: "", stderr: "" });
    });
    apps = new LinuxAppsService(
      {
        hasSession: (id: string) => id === SESSION,
      } as unknown as WaylandGateway,
      new SessionApps(),
    );
    apps.paths = m.paths;
    updates = new LinuxAppUpdatesService(apps);
    updates.fetch = (url: string) => {
      const u = url;
      const channel = /^https:\/\/channels\.nixos\.org\/(.+)$/.exec(u)?.[1];
      const pin = channel ? channels[channel] : undefined;
      if (pin)
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: {
              location: `https://releases.nixos.org/nixos/${pin.release.slice(6)}/${pin.snapshot}`,
            },
          }),
        );
      const rev = /\/(nixos-[^/]+)\/git-revision$/.exec(u)?.[1];
      const found = Object.values(channels).find((p) => p.snapshot === rev);
      return Promise.resolve(found ? new Response(found.commit) : new Response("", { status: 404 }));
    };
    // The list as releases.nixos.org sends it: still compressed.
    updates.download = (url: string, dest: string) => {
      const snap = /\/(nixos-[^/]+)\/packages\.json\.br$/.exec(url)?.[1];
      const found = Object.values(channels).find((p) => p.snapshot === snap);
      if (!found) return Promise.reject(new Error("HTTP 404"));
      writeFileSync(dest, LISTS[found.commit]);
      return Promise.resolve();
    };
  });

  afterEach(() => {
    apps.onModuleDestroy();
    rmSync(m.root, { recursive: true, force: true });
    mockSpawn.mockReset();
    mockRun.mockReset();
  });

  const settled = async () => {
    while (apps.getJob()?.state === "running") await new Promise((r) => setImmediate(r));
    return apps.getJob()!;
  };
  const check = async () => {
    updates.check();
    const job = await settled();
    expect(job.error).toBeNull();
  };
  const update = async (pin: Pin, kind: "update" | "upgrade" = "update") => {
    await updates.move(kind, pin.commit, SESSION);
    return settled();
  };

  it("finds a newer snapshot and lists the apps whose versions change", async () => {
    await check();
    const status = await updates.status();
    expect(status.current).toEqual({ ...A, fromImage: true });
    expect(status.checkedAt).toEqual(expect.any(Number));
    expect(status.update).toEqual({
      ...B,
      changes: [{ name: "firefox", from: "159.0", to: "159.0.1" }],
      missing: [],
      rebuilt: 1,
    });
    expect(status.upgrade).toBeNull();
    // Checking changes nothing on the machine.
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("offers a newer release separately", async () => {
    channels["nixos-26.11"] = U;
    await check();
    const status = await updates.status();
    expect(status.update?.snapshot).toBe(B.snapshot);
    expect(status.upgrade?.snapshot).toBe(U.snapshot);
    expect(status.upgrade?.changes).toEqual([
      { name: "firefox", from: "159.0", to: "160.0" },
      { name: "xterm", from: "410", to: "412" },
    ]);
  });

  it("moves the pin and every app, and Go back restores both", async () => {
    await check();
    expect((await update(B)).state).toBe("done");
    expect(commands()).toEqual([
      `nix registry add nixpkgs github:NixOS/nixpkgs/${B.commit}`,
      "nix profile upgrade firefox xterm",
      "nix store gc",
    ]);
    expect(registry).toBe(`github:NixOS/nixpkgs/${B.commit}`);
    expect(generationOf("profile")).toBe(2);
    let status = await updates.status();
    expect(status.current).toEqual({ ...B, fromImage: false });
    expect(status.previous).toEqual(A);
    expect(status.update).toBeNull();
    // Search now reads the new pin's list.
    expect((await apps.search("firefox"))[0].version).toBe("159.0.1");

    mockSpawn.mockClear();
    await updates.goBack(SESSION);
    expect((await settled()).state).toBe("done");
    // The image's own pin needs no registry entry; its apps are generation 1.
    expect(commands()).toEqual(["nix registry remove nixpkgs", "nix profile rollback --to 1"]);
    expect(registry).toBeNull();
    expect(generationOf("profile")).toBe(1);
    status = await updates.status();
    expect(status.current).toEqual({ ...A, fromImage: true });
    expect(status.previous).toEqual(B);
    expect((await apps.search("firefox"))[0].version).toBe("159.0");
  });

  it("keeps two pins on disk after a second move, not three", async () => {
    await check();
    await update(B);
    channels["nixos-26.05"] = C;
    await check();
    mockSpawn.mockClear();
    expect((await update(C)).state).toBe("done");
    // Generation 1 (the image's pin) goes; 2 (B) stays for Go back.
    expect(generations("profile")).toEqual([2, 3]);
    expect((await updates.status()).previous).toEqual(B);
    expect(readdirSync(join(m.paths.cacheDir, "pins")).sort()).toEqual([B.commit, C.commit].sort());
    expect(
      readdirSync(m.paths.cacheDir)
        .filter((f) => f.startsWith("index-"))
        .sort(),
    ).toEqual([`index-${B.commit}.json`, `index-${C.commit}.json`].sort());
  });

  it("moves Xwayland with the apps, and back", async () => {
    mkdirSync(join(m.root, "store-imbatranim-xwayland-1", "bin"), {
      recursive: true,
    });
    writeFileSync(join(m.root, "store-imbatranim-xwayland-1", "bin", "Xwayland"), "");
    symlinkSync(join(m.root, "store-imbatranim-xwayland-1"), join(m.profiles, "imbatranim-xwayland-1-link"));
    symlinkSync("imbatranim-xwayland-1-link", join(m.profiles, "imbatranim-xwayland"));
    await check();
    await update(B);
    expect(commands()).toContain("nix profile upgrade --profile <root>/state/profiles/imbatranim-xwayland --all");
    expect(generationOf("imbatranim-xwayland")).toBe(2);
    mockSpawn.mockClear();
    await updates.goBack(SESSION);
    await settled();
    expect(commands()).toContain("nix profile rollback --profile <root>/state/profiles/imbatranim-xwayland --to 1");
    expect(generationOf("imbatranim-xwayland")).toBe(1);
  });

  it("puts the pin and the apps back when the rebuild fails", async () => {
    await check();
    failing = /profile upgrade/;
    const job = await update(B);
    expect(job.state).toBe("failed");
    expect(commands()).toEqual([
      `nix registry add nixpkgs github:NixOS/nixpkgs/${B.commit}`,
      "nix profile upgrade firefox xterm",
      "nix registry remove nixpkgs",
    ]);
    expect(registry).toBeNull();
    const status = await updates.status();
    expect(status.current).toEqual({ ...A, fromImage: true });
    expect(status.previous).toBeNull();
    // Still on offer, to try again.
    expect(status.update?.snapshot).toBe(B.snapshot);
  });

  it("moves only to what the last check offered, and only from a live tab", async () => {
    await expect(updates.move("update", B.commit, SESSION)).rejects.toThrow(/no longer on offer/);
    await check();
    await expect(updates.move("update", C.commit, SESSION)).rejects.toThrow(/no longer on offer/);
    await expect(updates.move("update", B.commit, "zzzzzzzzzzzzzzzz")).rejects.toThrow(/session/);
    await expect(updates.goBack(SESSION)).rejects.toThrow(/no earlier release/);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("forgets Go back once Free space deleted its generation", async () => {
    await check();
    await update(B);
    unlinkSync(join(m.profiles, "profile-1-link"));
    expect((await updates.status()).previous).toBeNull();
    await expect(updates.goBack(SESSION)).rejects.toThrow(/no earlier release/);
  });

  it("lets an image with a newer pin win over the moved one", async () => {
    await check();
    await update(B);
    writeFileSync(
      m.paths.pinFile,
      `NIXPKGS_RELEASE=${C.release}\nNIXPKGS_SNAPSHOT=${C.snapshot}\nNIXPKGS_COMMIT=${C.commit}\n`,
    );
    mockRun.mockClear();
    await updates.reconcile();
    expect(mockRun.mock.calls.map((c) => (c[1] as string[]).join(" "))).toContain("registry remove nixpkgs");
    const state = JSON.parse(readFileSync(join(m.paths.cacheDir, "pins.json"), "utf8")) as {
      current: unknown;
      previous: unknown;
    };
    expect(state.current).toBeNull();
    expect(state.previous).toBeNull();
  });
});
