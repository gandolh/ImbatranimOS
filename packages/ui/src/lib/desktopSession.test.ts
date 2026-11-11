// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { desktopSessionId, renewDesktopSessionId } from "./desktopSession";

describe("desktopSessionId", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("makes one id per tab, file-name safe, and keeps it", () => {
    const id = desktopSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(desktopSessionId()).toBe(id);
    expect(window.sessionStorage.getItem("imbatranim:desktop-session")).toBe(id);
  });

  it("renews to a different id and keeps the new one", () => {
    const first = desktopSessionId();
    const second = renewDesktopSessionId();
    expect(second).not.toBe(first);
    expect(desktopSessionId()).toBe(second);
  });

  it("replaces a stored value that is not a valid id", () => {
    window.sessionStorage.setItem("imbatranim:desktop-session", "../x");
    expect(desktopSessionId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
