import { describe, expect, it, vi } from "vitest";
import type { SystemFs } from "@imbatranim/ui";
import { saveScreenshot } from "./screenshotApi";

function fakeFs(choice: { root: string; path: string } | null) {
  const order: string[] = [];
  const fs = {
    pickSave: vi.fn(async () => {
      order.push("dialog");
      return choice;
    }),
    upload: vi.fn(async () => {
      order.push("upload");
      return { version: null };
    }),
  };
  return { fs: fs as unknown as SystemFs, raw: fs, order };
}

describe("saveScreenshot", () => {
  it("asks in the Save dialog, opened in the screenshots folder, and the stage returns before the upload", async () => {
    const { fs, raw, order } = fakeFs({ root: "home", path: "Pictures/Screenshots/a.png" });
    const picked = vi.fn(() => order.push("picked"));
    await expect(saveScreenshot(fs, new Blob(["x"]), picked)).resolves.toBe("~/Pictures/Screenshots/a.png");
    expect(raw.pickSave).toHaveBeenCalledWith(
      expect.objectContaining({ startIn: { root: "home", path: "Pictures/Screenshots" } }),
    );
    expect(order).toEqual(["dialog", "picked", "upload"]);
  });

  it("a cancel writes nothing and still brings the stage back", async () => {
    const { fs, raw } = fakeFs(null);
    const picked = vi.fn();
    await expect(saveScreenshot(fs, new Blob(["x"]), picked)).resolves.toBeNull();
    expect(picked).toHaveBeenCalledOnce();
    expect(raw.upload).not.toHaveBeenCalled();
  });
});
