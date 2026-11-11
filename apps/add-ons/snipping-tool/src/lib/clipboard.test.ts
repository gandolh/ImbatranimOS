import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canCopyImages, copyPng } from "./clipboard";

// The tests run in node, but the package's types are the browser's.
const nodeProcess = (
  globalThis as unknown as {
    process: {
      on: (e: string, f: () => void) => void;
      off: (e: string, f: () => void) => void;
    };
  }
).process;

class FakeClipboardItem {
  items: Record<string, Blob | Promise<Blob>>;
  constructor(items: Record<string, Blob | Promise<Blob>>) {
    this.items = items;
  }
}

function stubBrowser(write: (items: FakeClipboardItem[]) => Promise<void>, secure = true) {
  vi.stubGlobal("window", { isSecureContext: secure, ClipboardItem: FakeClipboardItem });
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  vi.stubGlobal("navigator", { clipboard: { write } });
}

describe("copyPng", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("writes one image/png item and reports success", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    stubBrowser(write);
    const blob = new Blob(["x"], { type: "image/png" });
    expect(await copyPng(blob)).toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]];
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0].items)).toEqual(["image/png"]);
  });

  it("hands a pending raster to the write as a promise", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    stubBrowser(write);
    const pending = Promise.resolve(new Blob(["x"]));
    await copyPng(pending);
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]];
    expect(items[0].items["image/png"]).toBe(pending);
  });

  it("explains a refusal for lack of a user action", async () => {
    stubBrowser(() => Promise.reject(new DOMException("no", "NotAllowedError")));
    const r = await copyPng(new Blob(["x"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/click or key press/);
  });

  it("explains an insecure page without calling the clipboard", async () => {
    const write = vi.fn();
    stubBrowser(write, false);
    expect(canCopyImages()).toBe(false);
    const r = await copyPng(new Blob(["x"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/secure page/);
    expect(write).not.toHaveBeenCalled();
  });

  it("issues the write before the raster has finished", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    stubBrowser(write);
    let resolveBlob!: (b: Blob) => void;
    const pending = new Promise<Blob>((r) => {
      resolveBlob = r;
    });
    const copied = copyPng(pending);
    expect(write).toHaveBeenCalledTimes(1);
    resolveBlob(new Blob(["x"]));
    expect(await copied).toEqual({ ok: true });
  });

  it("reports a failed raster without an unhandled rejection", async () => {
    const unhandled = vi.fn();
    nodeProcess.on("unhandledRejection", unhandled);
    stubBrowser(async (items) => {
      await items[0].items["image/png"];
    });
    const r = await copyPng(Promise.reject(new Error("toBlob returned null")));
    await new Promise((resolve) => setTimeout(resolve, 10));
    nodeProcess.off("unhandledRejection", unhandled);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/encoded/);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
