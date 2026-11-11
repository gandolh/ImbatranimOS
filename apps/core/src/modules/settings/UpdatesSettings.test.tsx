// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../lib/axios", () => ({ api: { get, post } }));
vi.mock("../linux-windows/launchers", () => ({ reloadLinuxLaunchers: vi.fn() }));

import { UpdatesSettings } from "./UpdatesSettings";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = {
  release: "nixos-26.05",
  snapshot: "nixos-26.05.13446.7dcdd87373d7",
  commit: "7dcdd87373d72e7a2173e4db02e20d3d7f495cfd",
};
const B = {
  release: "nixos-26.05",
  snapshot: "nixos-26.05.13627.c56a87d8e41c",
  commit: "c56a87d8e41ce69bd2af57eb35dcc117a9dfca33",
};

let container: HTMLDivElement;
let root: Root;
let updates: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  updates = {
    available: true,
    current: { ...A, fromImage: true },
    previous: null,
    checkedAt: null,
    update: null,
    upgrade: null,
  };
  get.mockImplementation((path: string) =>
    Promise.resolve({ data: path === "/linux-apps/updates" ? updates : { job: null } }),
  );
  post.mockResolvedValue({ data: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <UpdatesSettings />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label);

describe("Settings → Updates", () => {
  it("shows the release, and checks on the button", async () => {
    await render();
    expect(container.textContent).toContain("NixOS 26.05, build 13446 (7dcdd873)");
    expect(container.textContent).toContain("Not checked yet");
    await act(async () => button("Check for updates")!.click());
    expect(post).toHaveBeenCalledWith("/linux-apps/updates/check", {});
  });

  it("lists the apps an update changes, a newer release apart, and Go back", async () => {
    updates = {
      ...(updates as object),
      checkedAt: Date.now(),
      update: {
        ...B,
        changes: [{ name: "firefox", from: "159.0", to: "159.0.1" }],
        missing: [],
        rebuilt: 2,
      },
      upgrade: {
        release: "nixos-26.11",
        snapshot: `nixos-26.11.10.${"e".repeat(12)}`,
        commit: "e".repeat(40),
        changes: [],
        missing: ["oldtool"],
        rebuilt: 0,
      },
      previous: B,
    };
    await render();
    expect(container.textContent).toContain("Updates are available");
    const change = container.querySelector('[data-linux-change="firefox"]');
    expect(change?.textContent).toBe("firefox159.0159.0.1");
    expect(container.textContent).toContain("2 other apps rebuilt with fixes");
    expect(container.textContent).toContain("Upgrade to NixOS 26.11");
    expect(container.textContent).toContain("so it stays as it is: oldtool");
    expect(button("Update")).toBeDefined();
    expect(button("Upgrade")).toBeDefined();
    expect(container.querySelector(`[data-linux-previous="${B.snapshot}"]`)).not.toBeNull();
    expect(button("Go back")).toBeDefined();
    expect(container.textContent).toContain("keep running their old build");
  });

  it("says so when the machine has no Linux apps", async () => {
    updates = { ...(updates as object), available: false, current: null };
    await render();
    expect(container.textContent).toContain("Linux apps aren't available on this machine");
    expect(button("Check for updates")).toBeUndefined();
  });
});
