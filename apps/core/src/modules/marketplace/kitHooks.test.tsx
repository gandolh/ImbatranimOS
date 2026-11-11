// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  SHARED_KIT_VERSION,
  useSystem,
  type CommandItem,
  type CommandSource,
  type CommandSourceContext,
  type KitBackgroundProps,
} from "@imbatranim/ui";
import { syncMarketplaceApps, type MarketplaceApp } from "../../shared/registry/marketplace";
import { BackgroundServices } from "../../shared/components/BackgroundServices";
import { COMMAND_SOURCES, activateItem, searchAllSources } from "../../shared/commands/CommandSourcesRegistry";
import "../../shared/commands/coreSources";
import { useAddonStore } from "../../shared/store/addonStore";
import { useNotificationStore } from "../../shared/store/notificationStore";
import { apiUrl } from "./apiUrl";

/**
 * A kit app's hooks, from the registry's sync to what the owner sees: its
 * module imported once the page is idle, its `Background` mounted with no
 * window, its sources in the palette and Start's search, and every failure
 * kept to that app with one notification.
 */

/** The modules the desktop "imports", by URL: an Error is a module that fails to load. */
const modules = vi.hoisted(() => new Map<string, unknown>());
const importKitModule = vi.hoisted(() =>
  vi.fn((href: string) => {
    const mod = modules.get(href);
    return mod instanceof Error ? Promise.reject(mod) : Promise.resolve(mod);
  }),
);
vi.mock("./kitModule", () => ({ importKitModule, startKitApp: vi.fn() }));

vi.mock("../../lib/axios", () => ({
  api: {
    get: vi.fn(() => Promise.reject(new Error("offline"))),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: { written: 0 } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

function hookApp(id: string, extra: Partial<MarketplaceApp> = {}, buildId = "b1"): MarketplaceApp {
  return {
    id,
    descriptorId: "kit-hooks",
    descriptorName: "Hooks Fixture",
    name: id[0].toUpperCase() + id.slice(1),
    description: "",
    meta: [],
    type: "static",
    icon: "rocket",
    window: { defaultSize: { w: 420, h: 240 }, minSize: { w: 320, h: 200 } },
    capabilities: ["notify"],
    multiInstance: false,
    opens: [],
    background: true,
    commandSources: true,
    minSystemVersion: 2,
    sharedKit: SHARED_KIT_VERSION,
    catalogSharedKit: SHARED_KIT_VERSION,
    ref: "a".repeat(40),
    runtime: "native",
    installed: {
      ref: "a".repeat(40),
      buildId,
      installedAt: 0,
      entryPath: `marketplace/apps/kit-hooks/b/${buildId}/${id}/app.mjs`,
      stylePaths: [],
      missing: false,
    },
    job: null,
    server: { state: "stopped" },
    ...extra,
  };
}

const hrefOf = (app: MarketplaceApp) => apiUrl(app.installed!.entryPath!).href;

/** What the services mounted saw, by app id. */
const running = new Map<string, { windowId: string | null; host: KitBackgroundProps["host"] }>();
const reached = new Map<string, string>();

/** A `Background` that records itself while mounted, and what reaching for `fs` said. */
function background(appId: string) {
  return function Background({ host }: KitBackgroundProps) {
    const system = useSystem();
    useEffect(() => {
      running.set(appId, { windowId: system.windowId, host });
      try {
        void system.fs;
      } catch (err) {
        reached.set(appId, (err as Error).message);
      }
      void system.server?.request().catch((err: Error) => reached.set(`${appId}:server`, err.message));
      return () => {
        running.delete(appId);
      };
    }, [system, host]);
    return null;
  };
}

/** A source answering one result per query, recording what it was asked. */
function source(group: string): CommandSource & { activated: CommandItem[] } {
  const activated: CommandItem[] = [];
  return {
    group,
    activated,
    search: (query: string) =>
      Promise.resolve([{ id: "count", label: `${group}: ${query}`, subtitle: "ticks", group }]),
    activate: (item: CommandItem) => {
      activated.push(item);
    },
  };
}

let container: HTMLDivElement;
let root: Root;
let consoleError: MockInstance<typeof console.error>;

/** Sync the registry the way a listing does, then let the idle load run. */
async function sync(apps: MarketplaceApp[]): Promise<void> {
  await act(async () => {
    syncMarketplaceApps(apps);
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Wait, rendering, until `check` holds. */
async function until(check: () => void | Promise<void>): Promise<void> {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await check();
  });
}

const groups = () => COMMAND_SOURCES.map((s) => s.group);
const notices = () => useNotificationStore.getState().notifications;
const results = async (group: string) => (await searchAllSources("tick")).filter((i) => i.group === group);

beforeAll(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleError.mockRestore();
});

beforeEach(async () => {
  modules.clear();
  importKitModule.mockClear();
  running.clear();
  reached.clear();
  useAddonStore.setState({ disabled: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  // React 19 re-reports a caught error to window.onerror; the boundary handled it.
  root = createRoot(container, { onCaughtError: () => {} });
  act(() => root.render(<BackgroundServices />));
  useNotificationStore.setState({ notifications: [], toasts: [] });
});

afterEach(async () => {
  await sync([]);
  // The hook waits for the registry to empty before the next test starts, so its `expect` is a retried wait.
  await until(() => expect(groups()).not.toContain("Ticker"));
  act(() => root.unmount());
  container.remove();
});

describe("a kit app's hooks", () => {
  it("loads the module only once the page is idle, and only for an app that declares a hook", async () => {
    const ticker = hookApp("ticker", { commandSources: false });
    const quiet = hookApp("quiet", { background: false, commandSources: false });
    modules.set(hrefOf(ticker), { App: () => null, Background: background("ticker") });
    act(() => syncMarketplaceApps([ticker, quiet]));
    // The sync returns before any app's module is asked for.
    expect(importKitModule).not.toHaveBeenCalled();
    await until(() => expect(running.has("ticker")).toBe(true));
    expect(importKitModule.mock.calls.map(([href]) => href)).toEqual([hrefOf(ticker)]);
  });

  it("runs Background with no window, fenced to the capabilities, and lists the commands", async () => {
    const ticker = hookApp("ticker");
    const ticks = source("Ticker");
    modules.set(hrefOf(ticker), {
      App: () => null,
      Background: background("ticker"),
      commandSources: [ticks],
    });
    await sync([ticker]);
    await until(() => expect(running.get("ticker")).toBeDefined());

    expect(running.get("ticker")).toEqual({
      windowId: null,
      host: {
        appId: "ticker",
        assetBase: new URL(".", hrefOf(ticker)).href,
        server: null,
      },
    });
    expect(reached.get("ticker")).toMatch(/did not ask for system\.fs/);
    await until(() =>
      expect(reached.get("ticker:server")).toBe(
        "Ticker's background service can't start its server; only a window can.",
      ),
    );

    // The palette and Start's search read the same sources.
    const [item] = await results("Ticker");
    expect(item).toEqual({
      id: "ticker:count",
      label: "Ticker: tick",
      subtitle: "ticks",
      group: "Ticker",
    });
    activateItem(item);
    // Handed back as the source answered it.
    expect(ticks.activated).toEqual([{ ...item, id: "count" }]);
    expect(notices()).toEqual([]);
  });

  it("takes both away while the app is disabled, and brings them back when it is enabled", async () => {
    const ticker = hookApp("ticker");
    modules.set(hrefOf(ticker), {
      App: () => null,
      Background: background("ticker"),
      commandSources: [source("Ticker")],
    });
    await sync([ticker]);
    await until(() => expect(running.has("ticker")).toBe(true));

    act(() => useAddonStore.getState().disable("ticker"));
    await until(() => expect(running.has("ticker")).toBe(false));
    expect(await results("Ticker")).toEqual([]);

    act(() => useAddonStore.getState().enable("ticker"));
    await until(() => expect(running.has("ticker")).toBe(true));
    expect(await results("Ticker")).toHaveLength(1);
    // One import: turning an app off and on does not load its module again.
    expect(importKitModule).toHaveBeenCalledTimes(1);
  });

  it("does not load a disabled app until it is enabled", async () => {
    const ticker = hookApp("ticker", { commandSources: false });
    modules.set(hrefOf(ticker), { App: () => null, Background: background("ticker") });
    useAddonStore.setState({ disabled: ["ticker"] });
    await sync([ticker]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(importKitModule).not.toHaveBeenCalled();
    act(() => useAddonStore.getState().enable("ticker"));
    await until(() => expect(running.has("ticker")).toBe(true));
  });

  it("unmounts and unregisters on uninstall, and a rebuild mounts the new build", async () => {
    const ticker = hookApp("ticker");
    const rebuilt = hookApp("ticker", {}, "b2");
    for (const app of [ticker, rebuilt]) {
      modules.set(hrefOf(app), {
        App: () => null,
        Background: background("ticker"),
        commandSources: [source("Ticker")],
      });
    }
    await sync([ticker]);
    await until(() => expect(running.has("ticker")).toBe(true));
    const first = running.get("ticker");

    await sync([]);
    await until(() => expect(running.has("ticker")).toBe(false));
    expect(groups()).not.toContain("Ticker");

    await sync([ticker]);
    await until(() => expect(running.has("ticker")).toBe(true));
    await sync([rebuilt]);
    await until(() => expect(running.get("ticker")?.host.assetBase).toBe(new URL(".", hrefOf(rebuilt)).href));
    expect(running.get("ticker")).not.toBe(first);
    expect(groups().filter((g) => g === "Ticker")).toHaveLength(1);
    expect(importKitModule.mock.calls.map(([href]) => href)).toContain(hrefOf(rebuilt));
  });

  it("keeps a running service across a sync that changed another app", async () => {
    const ticker = hookApp("ticker", { commandSources: false });
    const mounts: number[] = [];
    modules.set(hrefOf(ticker), {
      App: () => null,
      Background: function Background() {
        useEffect(() => {
          mounts.push(Date.now());
        }, []);
        return null;
      },
    });
    await sync([ticker]);
    await until(() => expect(mounts).toHaveLength(1));
    await sync([ticker, hookApp("quiet", { background: false, commandSources: false })]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mounts).toHaveLength(1);
  });

  it("refuses a declared hook the module does not export, by name, and still opens nothing else", async () => {
    const hookless = hookApp("hookless");
    modules.set(hrefOf(hookless), { App: () => null, commandSources: "not a list" });
    await sync([hookless]);
    await until(() => expect(notices()).toHaveLength(2));
    expect(notices().map((n) => [n.title, n.body, n.appId])).toEqual(
      expect.arrayContaining([
        [
          "Hookless's background service can't run.",
          "Hookless declares a background service, but its module does not export Background, a React component.",
          "hookless",
        ],
        [
          "Hookless's commands can't run.",
          "Hookless declares command sources, but its module does not export commandSources, a list of sources each with a group, search and activate.",
          "hookless",
        ],
      ]),
    );
    expect(running.size).toBe(0);
  });

  it("keeps a module that fails to load to that app, and says so once", async () => {
    const broken = hookApp("broken");
    const ticker = hookApp("ticker", { commandSources: false });
    modules.set(hrefOf(broken), new Error("404 Not Found"));
    modules.set(hrefOf(ticker), { App: () => null, Background: background("ticker") });
    await sync([broken, ticker]);
    await until(() => expect(running.has("ticker")).toBe(true));
    await until(() => expect(notices()).toHaveLength(1));
    expect(notices()[0]).toMatchObject({
      title: "Broken's background service and commands can't run.",
      body: "Its module didn't load: 404 Not Found",
      appId: "broken",
      level: "error",
    });
    // Another sync of the same build neither imports it again nor repeats the notice.
    await sync([broken, ticker, hookApp("quiet", { background: false, commandSources: false })]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(importKitModule.mock.calls.filter(([href]) => href === hrefOf(broken))).toHaveLength(1);
    expect(notices()).toHaveLength(1);
  });

  it("hides a Background that throws with one notification, and the other services run", async () => {
    const thrower = hookApp("thrower", { commandSources: false });
    const ticker = hookApp("ticker", { commandSources: false });
    modules.set(hrefOf(thrower), {
      App: () => null,
      Background: function Background(): never {
        throw new Error("due dates unreadable");
      },
    });
    modules.set(hrefOf(ticker), { App: () => null, Background: background("ticker") });
    await sync([thrower, ticker]);
    await until(() => expect(running.has("ticker")).toBe(true));
    await until(() => expect(notices()).toHaveLength(1));
    expect(notices()[0]).toMatchObject({
      title: "Thrower stopped working in the background.",
      body: "due dates unreadable",
      appId: "thrower",
    });
  });

  it("hides a source that throws with one notification until the app is turned off and on", async () => {
    const ticker = hookApp("ticker", { background: false });
    let fail = true;
    modules.set(hrefOf(ticker), {
      App: () => null,
      commandSources: [
        {
          group: "Ticker",
          search: (query: string) => {
            if (fail) throw new Error("index missing");
            return Promise.resolve([{ id: "n", label: query, group: "Ticker" }]);
          },
          activate: () => undefined,
        },
      ],
    });
    await sync([ticker]);
    await until(() => expect(groups()).toContain("Ticker"));

    expect(await results("Ticker")).toEqual([]);
    expect(await results("Ticker")).toEqual([]);
    expect(notices().map((n) => [n.title, n.body])).toEqual([["Ticker's commands stopped working.", "index missing"]]);

    fail = false;
    expect(await results("Ticker")).toEqual([]);
    act(() => useAddonStore.getState().disable("ticker"));
    act(() => useAddonStore.getState().enable("ticker"));
    await until(async () => expect(await results("Ticker")).toHaveLength(1));
  });

  it("gives a source an http of its own only when the descriptor asks for http", async () => {
    const asked = hookApp("asker", { background: false, capabilities: ["http"] });
    const unasked = hookApp("ticker", { background: false });
    const said = new Map<string, string>();
    const probe = (appId: string, group: string): CommandSource => ({
      group,
      search: (_query: string, ctx: CommandSourceContext) => {
        try {
          said.set(appId, typeof ctx.http.get);
        } catch (err) {
          said.set(appId, (err as Error).message);
        }
        return Promise.resolve([]);
      },
      activate: () => undefined,
    });
    modules.set(hrefOf(asked), { App: () => null, commandSources: [probe("asker", "Asker")] });
    modules.set(hrefOf(unasked), { App: () => null, commandSources: [probe("ticker", "Ticker")] });
    await sync([asked, unasked]);
    await until(() => expect(groups()).toEqual(expect.arrayContaining(["Asker", "Ticker"])));
    await searchAllSources("x");
    expect(said.get("asker")).toBe("function");
    expect(said.get("ticker")).toBe('Ticker did not ask for system.http; add "http" to its descriptor\'s capabilities');
  });

  it("gives a source the app's own folders whatever its capabilities", async () => {
    const ticker = hookApp("ticker", { background: false });
    let seen: unknown;
    modules.set(hrefOf(ticker), {
      App: () => null,
      commandSources: [
        {
          group: "Ticker",
          search: (_query: string, ctx: CommandSourceContext) => {
            seen = ctx.data && typeof ctx.data.read;
            return Promise.resolve([]);
          },
          activate: () => undefined,
        },
      ],
    });
    await sync([ticker]);
    await until(() => expect(groups()).toContain("Ticker"));
    await searchAllSources("x");
    expect(seen).toBe("function");
  });

  it("leaves out a source whose group another source has, and says so", async () => {
    const ticker = hookApp("ticker", { background: false });
    modules.set(hrefOf(ticker), {
      App: () => null,
      commandSources: [source("Apps"), source("Ticker")],
    });
    await sync([ticker]);
    await until(() => expect(groups()).toContain("Ticker"));
    expect(groups().filter((g) => g === "Apps")).toHaveLength(1);
    expect(notices().map((n) => [n.title, n.body])).toEqual([
      ["Ticker's commands were left out.", 'Another source already lists results under "Apps".'],
    ]);
  });
});
