// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, del, requestPick } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  requestPick: vi.fn(),
}));
vi.mock("../../lib/axios", () => ({ api: { get, post, delete: del } }));
vi.mock("../../system/filePortal", () => ({ requestPick }));

import { OldDataSettings } from "../../modules/settings/OldDataSettings";
import { checkOldDataAtSignIn, oldDataFileName, useOldDataStore } from "../store/oldDataStore";
import { OldDataNoticeHost } from "./OldDataNotice";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SET_ASIDE = {
  apps: [
    { appId: "todo", name: "Todo" },
    { appId: "bookmarks", name: "Bookmarks" },
  ],
  sets: [
    { folder: "2026-11-09", appId: "todo", tables: { todos: "todos_premove_20261109" } },
    {
      folder: "2026-11-09",
      appId: "bookmarks",
      tables: { bookmark_groups: "bookmark_groups_premove_20261109" },
    },
  ],
  notice: true,
};
const DOWNLOADED = { ...SET_ASIDE, notice: false };
const EMPTY = { apps: [], sets: [], notice: false };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  useOldDataStore.setState({ status: null, step: "closed", savedTo: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
  await settle();
}

/** The dialogs portal into the body, so look there. */
const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const click = async (label: string) => {
  await act(async () => button(label)!.click());
  await settle();
};

async function signIn() {
  await act(async () => checkOldDataAtSignIn());
  await settle();
}

describe("the older data notice", () => {
  it("shows only when there is older data to ask about", async () => {
    get.mockResolvedValue({ data: EMPTY });
    await render(<OldDataNoticeHost />);
    await signIn();
    expect(text()).not.toContain("Incompatible older data");

    get.mockResolvedValue({ data: DOWNLOADED });
    await signIn();
    expect(text()).not.toContain("Incompatible older data");

    get.mockResolvedValue({ data: SET_ASIDE });
    await signIn();
    expect(text()).toContain("Incompatible older data was found for Todo and Bookmarks.");
  });

  it("comes back at the next sign-in until one is picked", async () => {
    get.mockResolvedValue({ data: SET_ASIDE });
    await render(<OldDataNoticeHost />);
    await signIn();
    await click("Later");
    expect(text()).not.toContain("Incompatible older data");
    await signIn();
    expect(text()).toContain("Incompatible older data");
  });

  it("downloads through the Save dialog, then offers the clean-out", async () => {
    get.mockResolvedValueOnce({ data: SET_ASIDE }).mockResolvedValue({ data: DOWNLOADED });
    requestPick.mockResolvedValue({ root: "home", path: "Documents/old.tar.gz" });
    post.mockResolvedValue({ data: { path: "Documents/old.tar.gz", files: 3 } });
    await render(<OldDataNoticeHost />);
    await signIn();
    await click("Download…");

    expect(requestPick).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "save", suggestedName: oldDataFileName() }),
    );
    expect(oldDataFileName(new Date(2026, 10, 9))).toBe("imbatranim-old-data-2026-11-09.tar.gz");
    expect(post).toHaveBeenCalledWith("/system/old-data/download", {
      root: "home",
      path: "Documents/old.tar.gz",
    });
    expect(text()).toContain("Saved to Documents/old.tar.gz");
    expect(button("Clean out…")).toBeDefined();
    expect(button("Download…")).toBeUndefined();

    // The download was the pick: the next sign-in doesn't ask.
    await click("Close");
    await signIn();
    expect(text()).not.toContain("Saved to");
    expect(text()).not.toContain("Incompatible older data");
  });

  it("a cancelled Save dialog keeps asking", async () => {
    get.mockResolvedValue({ data: SET_ASIDE });
    requestPick.mockResolvedValue(null);
    await render(<OldDataNoticeHost />);
    await signIn();
    await click("Download…");
    expect(post).not.toHaveBeenCalled();
    expect(text()).toContain("Incompatible older data");
  });

  it("cleans out only after it confirms", async () => {
    get.mockResolvedValueOnce({ data: SET_ASIDE }).mockResolvedValue({ data: EMPTY });
    del.mockResolvedValue({ data: { dropped: [] } });
    await render(<OldDataNoticeHost />);
    await signIn();
    await click("Clean out…");
    expect(text()).toContain("This deletes the older data for good.");
    expect(del).not.toHaveBeenCalled();

    await click("Cancel");
    expect(del).not.toHaveBeenCalled();
    expect(text()).toContain("Incompatible older data");

    await click("Clean out…");
    await click("Clean out");
    expect(del).toHaveBeenCalledWith("/system/old-data");
    expect(text()).not.toContain("Incompatible older data");
  });
});

describe("Settings: Clean out older data", () => {
  it("stays while older data is left, downloaded or not, and goes with it", async () => {
    get.mockResolvedValueOnce({ data: DOWNLOADED }).mockResolvedValue({ data: EMPTY });
    del.mockResolvedValue({ data: { dropped: [] } });
    await render(<OldDataSettings />);
    expect(text()).toContain("Older data is set aside for Todo and Bookmarks");

    await click("Clean out older data");
    expect(text()).toContain("This deletes the older data for good.");
    expect(del).not.toHaveBeenCalled();
    await click("Clean out");
    expect(del).toHaveBeenCalledWith("/system/old-data");
    expect(button("Clean out older data")).toBeUndefined();
  });

  it("shows nothing when none is set aside", async () => {
    get.mockResolvedValue({ data: EMPTY });
    await render(<OldDataSettings />);
    expect(button("Clean out older data")).toBeUndefined();
  });
});
