// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { AppConfig } from "../../registry/registry";
import { useNotificationStore } from "../../store/notificationStore";

/**
 * A desktop layer is an add-on's code mounted straight into the desktop, so one
 * that throws must take down only itself. Driven with `react-dom/client` and
 * React 19's `act`, as the window boundary's tests are.
 */

const ctl = vi.hoisted(() => ({ apps: [] as AppConfig[] }));

vi.mock("../../registry/enabledApps", () => ({
  useEnabledApps: () => ctl.apps,
  getEnabledApps: () => ctl.apps,
  NON_DISABLEABLE: new Set<string>(),
}));

// The boundary records a crash in the system log; no server here.
vi.mock("../../../lib/axios", () => ({
  api: { post: vi.fn(() => Promise.resolve({ data: {} })), get: vi.fn(() => Promise.reject(new Error("offline"))) },
}));

// jsdom has no ResizeObserver; the desktop measures itself with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { Desktop } = await import("./Desktop");

const Icon = () => null;

function app(id: string, name: string, desktopLayer: AppConfig["desktopLayer"]): AppConfig {
  return {
    id,
    name,
    description: "",
    meta: [],
    icon: Icon,
    component: () => null,
    multiInstance: false,
    defaultSize: { width: 400, height: 300 },
    minSize: { width: 200, height: 150 },
    desktopLayer,
  };
}

function BrokenLayer(): never {
  throw new Error("notes store unreadable");
}

const NotesLayer = () => <div data-testid="notes-layer">a note</div>;

let container: HTMLDivElement;
let root: Root;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  // React 19 re-reports a caught error to window.onerror, which vitest counts
  // as a failure; the boundary handled it, so say so.
  root = createRoot(container, { onCaughtError: () => {} });
  useNotificationStore.setState({ notifications: [], toasts: [] });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  consoleError.mockRestore();
});

const mount = (): void => {
  act(() => {
    root.render(<Desktop wallpaper="plain" />);
  });
};

describe("desktop layers", () => {
  it("draws a layer that renders", () => {
    ctl.apps = [app("sticky-notes", "Sticky Notes", NotesLayer)];
    mount();
    expect(container.querySelector('[data-testid="notes-layer"]')?.textContent).toBe("a note");
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("hides a layer that throws, keeps the desktop and the other layers, and says so once", () => {
    ctl.apps = [app("broken-notes", "Broken Notes", BrokenLayer), app("sticky-notes", "Sticky Notes", NotesLayer)];
    mount();
    // The desktop is still there: its icons and the other add-on's layer.
    expect(container.querySelectorAll('[data-testid="notes-layer"]')).toHaveLength(1);
    expect(container.textContent).toContain("Broken Notes");

    const notices = useNotificationStore.getState().notifications;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      title: "Broken Notes stopped working on the desktop.",
      appId: "broken-notes",
      level: "error",
    });

    // A later render of the desktop neither brings the layer back nor repeats
    // the notice.
    mount();
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});
