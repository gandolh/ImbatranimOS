import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseProgress, progressReporter, PROGRESS_RESET_MS } from "./progress";

describe("parseProgress", () => {
  it("reads the five states and the percent", () => {
    expect(parseProgress("4;1;40")).toEqual({ state: "normal", value: 40 });
    expect(parseProgress("4;2")).toEqual({ state: "error" });
    expect(parseProgress("4;2;40")).toEqual({ state: "error", value: 40 });
    expect(parseProgress("4;3")).toEqual({ state: "indeterminate" });
    expect(parseProgress("4;4;70")).toEqual({ state: "paused", value: 70 });
    expect(parseProgress("4;0")).toEqual({ state: "none" });
  });

  it("clamps the percent, and ignores any other OSC 9", () => {
    expect(parseProgress("4;1;250")).toEqual({ state: "normal", value: 100 });
    expect(parseProgress("Build done")).toBeNull();
    expect(parseProgress("4;9;10")).toBeNull();
    expect(parseProgress("4")).toBeNull();
  });
});

describe("progressReporter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows each report, and takes it off after 15 s with no update", () => {
    const show = vi.fn();
    const r = progressReporter(show);
    expect(r.report("4;1;40")).toBe(true);
    vi.advanceTimersByTime(PROGRESS_RESET_MS - 1);
    r.report("4;1;60");
    vi.advanceTimersByTime(PROGRESS_RESET_MS - 1);
    expect(show.mock.calls.map((c) => c[0])).toEqual([
      { state: "normal", value: 40 },
      { state: "normal", value: 60 },
    ]);
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenLastCalledWith({ state: "none" });
  });

  it("clears at the next prompt, once", () => {
    const show = vi.fn();
    const r = progressReporter(show);
    r.report("4;3");
    r.clear();
    r.clear();
    expect(show.mock.calls.map((c) => c[0])).toEqual([{ state: "indeterminate" }, { state: "none" }]);
  });

  it("leaves another OSC 9 to whoever else reads it", () => {
    expect(progressReporter(vi.fn()).report("hello")).toBe(false);
  });
});
