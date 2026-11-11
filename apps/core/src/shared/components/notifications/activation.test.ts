import { describe, expect, it, vi } from "vitest";
import { activateNotification, registerNotificationActivation } from "./activation";
import type { NotificationItem } from "../../store/notificationStore";

const item = (source?: NotificationItem["source"]): NotificationItem => ({
  id: "a",
  title: "T",
  level: "info",
  timestamp: 0,
  read: false,
  source,
});

describe("notification activation", () => {
  it("hands an item to the handler of its source, and says so", () => {
    const fn = vi.fn();
    const off = registerNotificationActivation("linux", fn);
    const n = item({ kind: "linux", id: 3 });
    expect(activateNotification(n)).toBe(true);
    expect(fn).toHaveBeenCalledWith(n);
    off();
    expect(activateNotification(n)).toBe(false);
  });

  it("leaves an item without a source to the caller", () => {
    const fn = vi.fn();
    const off = registerNotificationActivation("linux", fn);
    expect(activateNotification(item())).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    off();
  });
});
