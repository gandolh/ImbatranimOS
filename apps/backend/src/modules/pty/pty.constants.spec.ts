import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startDirectory, terminalEnv } from "./pty.constants";

describe("terminalEnv", () => {
  it("puts the user's Nix profile first on PATH and leaves the input alone", () => {
    const base = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      NIX_STATE_HOME: "/nix/var/imbatranim/state",
      LOCALE_ARCHIVE: "/x/locale-archive",
    };
    const env = terminalEnv(base);
    expect(env.PATH).toBe("/nix/var/imbatranim/state/profile/bin:/usr/local/bin:/usr/bin:/bin");
    expect(env.LOCALE_ARCHIVE).toBe("/x/locale-archive");
    expect(base.PATH).toBe("/usr/local/bin:/usr/bin:/bin");
  });

  it("does not add the profile twice", () => {
    const env = terminalEnv({
      PATH: "/nix/var/imbatranim/state/profile/bin:/usr/bin",
      NIX_STATE_HOME: "/nix/var/imbatranim/state",
    });
    expect(env.PATH).toBe("/nix/var/imbatranim/state/profile/bin:/usr/bin");
  });

  it("adds nothing outside the container, where NIX_STATE_HOME is unset", () => {
    expect(terminalEnv({ PATH: "/usr/bin" })).toEqual({ PATH: "/usr/bin", TERM_PROGRAM: "imbatranim" });
  });

  it("names the tab's Wayland socket for a valid desktop session id", () => {
    expect(terminalEnv({}, "abcdefghijklmnop").WAYLAND_DISPLAY).toBe("wayland-abcdefghijklmnop");
  });

  it("adds no display for a missing or unsafe session id, and drops an inherited one", () => {
    expect(terminalEnv({ WAYLAND_DISPLAY: "wayland-1" }).WAYLAND_DISPLAY).toBeUndefined();
    expect(terminalEnv({}, "../../etc/passwd").WAYLAND_DISPLAY).toBeUndefined();
    expect(terminalEnv({}, "short").WAYLAND_DISPLAY).toBeUndefined();
  });

  it("names the session's X display for X11 apps, and none without a session", () => {
    expect(terminalEnv({}, "abcdefghijklmnop", 2).DISPLAY).toBe(":2");
    expect(terminalEnv({}, "abcdefghijklmnop", 0).DISPLAY).toBe(":0");
    // No display reserved, or no session: none, not the backend's own.
    expect(terminalEnv({ DISPLAY: ":9" }, "abcdefghijklmnop", null).DISPLAY).toBeUndefined();
    expect(terminalEnv({ DISPLAY: ":9" }, null, 2).DISPLAY).toBeUndefined();
    expect(terminalEnv({}, "abcdefghijklmnop", 1.5).DISPLAY).toBeUndefined();
  });

  it("names the tab's session bus, and never one for a missing session", () => {
    const base = { XDG_RUNTIME_DIR: "/run/user/1000" };
    expect(terminalEnv(base, "abcdefghijklmnop").DBUS_SESSION_BUS_ADDRESS).toBe(
      "unix:path=/run/user/1000/imbatranim-bus/abcdefghijklmnop",
    );
    expect(terminalEnv({ ...base, DBUS_SESSION_BUS_ADDRESS: "unix:path=/x" }).DBUS_SESSION_BUS_ADDRESS).toBeUndefined();
    // No runtime directory, no bus to name.
    expect(terminalEnv({}, "abcdefghijklmnop").DBUS_SESSION_BUS_ADDRESS).toBeUndefined();
  });

  it("names the tab's sound server, with its cookie outside the home", () => {
    const base = { XDG_RUNTIME_DIR: "/run/user/1000" };
    const env = terminalEnv(base, "abcdefghijklmnop");
    expect(env.PULSE_SERVER).toBe("unix:/run/user/1000/imbatranim-sound/abcdefghijklmnop");
    expect(env.PULSE_COOKIE).toBe("/run/user/1000/imbatranim-sound/cookie");
    // Without a session, not the backend's own either.
    const none = terminalEnv({ ...base, PULSE_SERVER: "unix:/x" });
    expect(none.PULSE_SERVER).toBeUndefined();
    expect(none.PULSE_COOKIE).toBeUndefined();
  });

  it("names the terminal for the bash integration, with the OS's version when it is known", () => {
    const env = terminalEnv({ TERM_PROGRAM: "vscode", TERM_PROGRAM_VERSION: "1.0" }, null, null, "1.397.0");
    expect(env.TERM_PROGRAM).toBe("imbatranim");
    expect(env.TERM_PROGRAM_VERSION).toBe("1.397.0");
    expect(terminalEnv({ TERM_PROGRAM_VERSION: "1.0" }, null, null, "unknown").TERM_PROGRAM_VERSION).toBeUndefined();
  });
});

describe("startDirectory", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "start-dir-"));
    writeFileSync(join(dir, "a-file"), "");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("uses a folder the user can enter", async () => {
    await expect(startDirectory(dir, "/home/x")).resolves.toBe(dir);
  });

  it("falls back to home for a relative path, a file, a missing path and a path with a newline", async () => {
    await expect(startDirectory("relative/dir", "/home/x")).resolves.toBe("/home/x");
    await expect(startDirectory(join(dir, "a-file"), "/home/x")).resolves.toBe("/home/x");
    await expect(startDirectory(join(dir, "missing"), "/home/x")).resolves.toBe("/home/x");
    await expect(startDirectory(`${dir}\nrm -rf ~`, "/home/x")).resolves.toBe("/home/x");
    await expect(startDirectory(null, "/home/x")).resolves.toBe("/home/x");
  });
});
