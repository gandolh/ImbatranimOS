// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * App identity on the page: each running copy of an app gets its own token,
 * sends it with every call to the backend, and keeps it away from the other
 * apps sharing the page.
 *
 * A stand-in backend is put in place of `fetch` before any module loads, so
 * core's network snapshot captures it as the page's own `fetch`; the tests
 * then replace the globals the way a hostile app would.
 */
const backend = vi.hoisted(() => {
  vi.stubEnv("VITE_API_URL", "http://localhost:3000/api");

  type Seen = { method: string; url: string; token: string | null; body: string };
  // The stand-in's own, so a test replacing the global doesn't see the stand-in's work.
  const OwnRequest = globalThis.Request;
  const state = {
    seen: [] as Seen[],
    /** A call to /api/slow waits on this. */
    gate: Promise.resolve(),
    /** token → app id, as the backend's map holds them. */
    live: new Map<string, string>(),
    /** Tokens the backend has "forgotten", as a restart does. */
    forget: () => state.live.clear(),
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = input instanceof OwnRequest ? input : new OwnRequest(input, init);
    const token = req.headers.get("x-imbatranim-app-token");
    const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    const path = new URL(req.url).pathname;
    state.seen.push({ method: req.method, url: req.url, token, body });

    if (path === "/api/system/app-tokens" && req.method === "POST") {
      const parsed = JSON.parse(body) as { token: string; appId: string };
      state.live.set(parsed.token, parsed.appId);
      return json(201, { app: { appId: parsed.appId } });
    }
    if (path === "/api/system/app-tokens/self" && req.method === "DELETE") {
      if (token) state.live.delete(token);
      return new Response(null, { status: 204 });
    }
    if (token !== null && !state.live.has(token)) {
      return json(403, { statusCode: 403, code: "APP_TOKEN_REFUSED", message: "refused" });
    }
    if (path === "/api/forbidden") return json(403, { code: "MODE_REFUSED" });
    if (path === "/api/slow") await state.gate;
    return json(200, { path, app: token ? state.live.get(token) : null });
  }

  globalThis.fetch = fakeFetch as typeof fetch;
  return state;
});

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useSystem } from "@imbatranim/ui";
import { useWindowStore } from "../shared/store/windowStore";
import { appInstanceOf, createSystemHandle } from "./createSystemHandle";
import { CLOSE_GRACE_MS, createAppInstance } from "./appInstance";
import { WindowlessSystemProvider } from "./WindowlessSystemProvider";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const capturedFetch = globalThis.fetch;

function openTestWindow(appId: string): string {
  return useWindowStore.getState().openWindow(appId, appId, { width: 400, height: 300 }, { width: 200, height: 150 });
}

const registrations = () => backend.seen.filter((s) => s.method === "POST" && s.url.endsWith("/system/app-tokens"));
const tokenOf = (registration: { body: string }) => (JSON.parse(registration.body) as { token: string }).token;

beforeEach(async () => {
  // The reset closes the last test's windows: their revokes run out here,
  // before this test's record starts.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  useWindowStore.setState({ windows: [], nextZIndex: 1, closeGuards: {} });
  await vi.runAllTimersAsync();
  backend.seen.length = 0;
  backend.live.clear();
});

afterEach(() => {
  globalThis.fetch = capturedFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("an app’s calls carry its own token", () => {
  it("mints on the first call, registers as the user, then sends it on every call", async () => {
    const system = createSystemHandle("notepad", openTestWindow("notepad"));
    // Nothing goes out until the app calls.
    expect(backend.seen).toEqual([]);

    const res = await system.http.get<{ app: string }>("/notes");
    await system.http.post("/notes", { text: "hi" });

    expect(registrations()).toHaveLength(1);
    const [registration] = registrations();
    expect(registration.token).toBeNull();
    const token = tokenOf(registration);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(registration.body)).toMatchObject({
      appId: "notepad",
      instanceId: system.windowId,
      windowId: system.windowId,
    });
    expect(res.data.app).toBe("notepad");
    const calls = backend.seen.filter((s) => s.url.endsWith("/api/notes"));
    expect(calls.map((c) => c.token)).toEqual([token, token]);
  });

  it("two copies of one app have two tokens; file and schedule calls carry them too", async () => {
    const a = createSystemHandle("paint", openTestWindow("paint"));
    const b = createSystemHandle("paint", null);
    await a.fs.read("home", "a.png");
    await b.schedule.claim("clock", "1", 1);
    const [first, second] = registrations().map(tokenOf);
    expect(first).not.toBe(second);
    expect(backend.seen.find((s) => s.url.includes("/files/download"))?.token).toBe(first);
    expect(backend.seen.find((s) => s.url.endsWith("/schedule/claim"))?.token).toBe(second);
  });

  it("system.data calls carry the copy’s token, a windowless copy’s too", async () => {
    const win = createSystemHandle("hollow", openTestWindow("hollow"));
    const service = createSystemHandle("hollow", null);
    await win.data!.write("save.json", "{}", { expected: null });
    await service.data!.list("", { kind: "state" });
    const [first, second] = registrations().map(tokenOf);
    expect(first).not.toBe(second);
    const write = backend.seen.find((s) => s.url.includes("/system/data/data/file"));
    expect(write?.method).toBe("PUT");
    expect(write?.token).toBe(first);
    expect(JSON.parse(write!.body)).toEqual({ path: "save.json", content: "{}", expected: null });
    expect(backend.seen.find((s) => s.url.includes("/system/data/state/list"))?.token).toBe(second);
  });

  it("Settings, Files and the Terminal call as the user, with no token", () => {
    for (const id of ["settings", "file-manager", "terminal"]) {
      expect(appInstanceOf(createSystemHandle(id, null))).toBeUndefined();
    }
    expect(appInstanceOf(createSystemHandle("notepad", null))).toBeDefined();
  });

  it("a token goes only to the OS’s own API", async () => {
    const system = createSystemHandle("notepad", null);
    // Not through the stand-in: the shared client, as before, with no token.
    const shared = vi.fn(() => Promise.resolve({ data: "x", status: 200, headers: {} }));
    const { api } = await import("../lib/axios");
    vi.spyOn(api, "request").mockImplementation(shared as never);
    await system.http.get("https://elsewhere.example/thing");
    expect(registrations()).toHaveLength(0);
    expect(shared).toHaveBeenCalledTimes(1);
    const config = (shared.mock.calls[0] as unknown as [{ headers: Record<string, string> }])[0];
    expect(Object.keys(config.headers)).not.toContain("X-Imbatranim-App-Token");
  });

  it("drops a token header an app set itself", async () => {
    const system = createSystemHandle("notepad", null);
    await system.http.get("/notes", { headers: { "x-imbatranim-app-token": "f".repeat(64) } });
    const token = tokenOf(registrations()[0]);
    expect(backend.seen.find((s) => s.url.endsWith("/api/notes"))?.token).toBe(token);
  });

  it("answers with the protocol’s shape only: no config or request, which hold the token", async () => {
    const system = createSystemHandle("notepad", null);
    const res = await system.http.get("/notes");
    expect(Object.keys(res).sort()).toEqual(["data", "headers", "status"]);

    const err = (await system.http.get("/forbidden").catch((e: unknown) => e)) as {
      config?: unknown;
      request?: unknown;
      response?: { status: number; data: unknown; config?: unknown };
    };
    expect(err.response?.status).toBe(403);
    expect(err.response?.data).toEqual({ code: "MODE_REFUSED" });
    expect(err.config).toBeUndefined();
    expect(err.request).toBeUndefined();
    expect(err.response?.config).toBeUndefined();
  });
});

describe("a token kept from the other apps on the page", () => {
  it("a patched global fetch in one app doesn’t see another app’s token", async () => {
    const victim = createSystemHandle("notepad", openTestWindow("notepad"));
    createSystemHandle("hollow", openTestWindow("hollow"));

    // The hostile app replaces every global a token could pass through.
    const seenByHostile: unknown[] = [];
    const hostileFetch = vi.fn((...args: unknown[]) => {
      seenByHostile.push(args);
      return capturedFetch(...(args as Parameters<typeof fetch>));
    });
    globalThis.fetch = hostileFetch as typeof fetch;
    for (const method of ["set", "append"] as const) {
      const original = Headers.prototype[method];
      vi.spyOn(Headers.prototype, method).mockImplementation(function (this: Headers, name: string, value: string) {
        seenByHostile.push([name, value]);
        original.call(this, name, value);
      });
    }
    const setRequestHeader = vi
      .spyOn(XMLHttpRequest.prototype, "setRequestHeader")
      .mockImplementation((name, value) => void seenByHostile.push([name, value]));
    const RealRequest = globalThis.Request;
    const hostileRequest = vi.fn();
    globalThis.Request = class extends RealRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init);
        hostileRequest(input, init);
      }
    } as typeof Request;

    try {
      await victim.http.get("/notes");
      await victim.fs.upload("home", "a.txt", new Uint8Array([1]), "a.txt");
    } finally {
      globalThis.Request = RealRequest;
    }

    const token = tokenOf(registrations()[0]);
    expect(backend.seen.filter((s) => s.token === token)).toHaveLength(2);
    expect(hostileFetch).not.toHaveBeenCalled();
    expect(hostileRequest).not.toHaveBeenCalled();
    expect(setRequestHeader).not.toHaveBeenCalled();
    expect(JSON.stringify(seenByHostile)).not.toContain(token);
  });
});

describe("a token dies with its copy", () => {
  it("closing the window revokes it after the grace, and refuses later calls", async () => {
    const id = openTestWindow("notepad");
    const system = createSystemHandle("notepad", id);
    await system.http.get("/notes");
    const token = tokenOf(registrations()[0]);

    useWindowStore.getState().closeWindow(id);
    // An app saving as it unmounts still gets through.
    await system.http.put("/notes/1", { text: "last words" });
    expect(backend.live.has(token)).toBe(true);

    await vi.advanceTimersByTimeAsync(CLOSE_GRACE_MS + 1);
    const revoke = backend.seen.find((s) => s.method === "DELETE");
    expect(revoke?.token).toBe(token);
    expect(backend.live.has(token)).toBe(false);
    await expect(system.http.get("/notes")).rejects.toThrow(/has closed/);
  });

  it("waits for a call under way before revoking", async () => {
    const instance = createAppInstance("notepad", null);
    await instance.http.get("/notes");
    let release!: () => void;
    backend.gate = new Promise<void>((r) => (release = r));
    const slow = instance.http.get("/slow");
    await vi.advanceTimersByTimeAsync(0);
    instance.close();
    await vi.advanceTimersByTimeAsync(CLOSE_GRACE_MS + 1);
    // The grace is over, but the call above has not answered yet.
    expect(backend.seen.some((s) => s.method === "DELETE")).toBe(false);
    await expect(instance.http.get("/notes")).rejects.toThrow(/has closed/);
    release();
    await slow;
    await vi.advanceTimersByTimeAsync(0);
    expect(backend.seen.filter((s) => s.method === "DELETE")).toHaveLength(1);
  });

  it("a copy reopened before the grace ends keeps its token (StrictMode’s remount)", async () => {
    const instance = createAppInstance("clock", null);
    await instance.http.get("/clock/alarms");
    instance.close();
    instance.open();
    await vi.advanceTimersByTimeAsync(CLOSE_GRACE_MS + 1);
    expect(backend.seen.some((s) => s.method === "DELETE")).toBe(false);
    await instance.http.get("/clock/alarms");
    expect(registrations()).toHaveLength(1);
  });

  it("a widget or service ends its token when it unmounts", async () => {
    function Widget() {
      const system = useSystem();
      useEffect(() => void system.http.get("/stats"), [system]);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(
        <WindowlessSystemProvider appId="system-monitor">
          <Widget />
        </WindowlessSystemProvider>,
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    const token = tokenOf(registrations()[0]);
    expect(backend.seen.find((s) => s.url.endsWith("/api/stats"))?.token).toBe(token);

    act(() => root.unmount());
    await vi.advanceTimersByTimeAsync(CLOSE_GRACE_MS + 1);
    expect(backend.seen.find((s) => s.method === "DELETE")?.token).toBe(token);
  });

  it("a copy that never called sends nothing when it closes", async () => {
    const instance = createAppInstance("clock", null);
    instance.close();
    await vi.advanceTimersByTimeAsync(CLOSE_GRACE_MS + 1);
    expect(backend.seen).toEqual([]);
  });
});

describe("a refused token", () => {
  it("is replaced once and the call tried again, as after a backend restart", async () => {
    const system = createSystemHandle("notepad", null);
    await system.http.get("/notes");
    backend.forget();
    const res = await system.http.get<{ app: string }>("/notes");
    expect(res.data.app).toBe("notepad");
    const [first, second] = registrations().map(tokenOf);
    expect(second).not.toBe(first);
    expect(backend.seen.at(-1)?.token).toBe(second);
  });

  it("in a binary download too", async () => {
    const system = createSystemHandle("paint", null);
    await system.fs.read("home", "a.png");
    backend.forget();
    const bytes = await system.fs.read("home", "a.png");
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(registrations()).toHaveLength(2);
  });

  it("a mode refusal is passed to the app, not retried", async () => {
    const system = createSystemHandle("notepad", null);
    await expect(system.http.get("/forbidden")).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(registrations()).toHaveLength(1);
    expect(backend.seen.filter((s) => s.url.endsWith("/forbidden"))).toHaveLength(1);
  });
});
