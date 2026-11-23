// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  finishedToast,
  formatDuration,
  loadNotifyLong,
  notifySwitchSource,
  saveNotifyLong,
  type FinishedCommand,
} from "./commandNotify";

const command = (over: Partial<FinishedCommand> = {}): FinishedCommand => ({
  startedAt: 0,
  endedAt: 11_000,
  exit: 0,
  title: "~/projects/x",
  focused: false,
  enabled: true,
  windowId: "w1",
  ...over,
});

beforeEach(() => localStorage.clear());

describe("finishedToast", () => {
  it("gives nothing for 9 s unfocused", () => {
    expect(finishedToast(command({ endedAt: 9_000 }))).toBeNull();
  });

  it("gives one toast for 11 s unfocused, with a Show that brings this window back", () => {
    expect(finishedToast(command())).toEqual({
      title: "Command finished",
      body: "11 s in ~/projects/x",
      level: "info",
      actions: [{ label: "Show", payload: { showWindow: "w1" } }],
    });
  });

  it("gives nothing for 11 s focused", () => {
    expect(finishedToast(command({ focused: true }))).toBeNull();
  });

  it("says a failed command's code", () => {
    expect(finishedToast(command({ exit: 2, endedAt: 134_000 }))).toMatchObject({
      title: "Command failed, exit 2",
      body: "2 min 14 s in ~/projects/x",
      level: "warning",
    });
  });

  it("gives nothing with the switch off", () => {
    expect(finishedToast(command({ enabled: false }))).toBeNull();
  });
});

describe("formatDuration", () => {
  it("says seconds, minutes and hours as people do", () => {
    expect(formatDuration(12_400)).toBe("12 s");
    expect(formatDuration(120_000)).toBe("2 min");
    expect(formatDuration(3_780_000)).toBe("1 h 3 min");
  });
});

describe("the switch", () => {
  it("is on until switched off, and the palette turns it", async () => {
    expect(loadNotifyLong()).toBe(true);
    const [item] = await notifySwitchSource.search("notify long", { http: undefined as never });
    expect(item?.label).toBe("Notify when a long command finishes: on");
    if (item) notifySwitchSource.activate(item);
    expect(loadNotifyLong()).toBe(false);
    saveNotifyLong(true);
    expect(loadNotifyLong()).toBe(true);
  });

  it("stays out of searches it doesn't match", async () => {
    expect(await notifySwitchSource.search("calendar", { http: undefined as never })).toEqual([]);
    expect(await notifySwitchSource.search("", { http: undefined as never })).toEqual([]);
  });
});
