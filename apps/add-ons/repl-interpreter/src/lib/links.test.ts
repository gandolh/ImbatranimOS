import { describe, expect, it } from "vitest";
import { linkAction, webLinkTarget } from "./links";

describe("webLinkTarget", () => {
  it("passes http and https, in any case", () => {
    expect(webLinkTarget("https://x")).toBe("https://x/");
    expect(webLinkTarget("HTTP://X")).toBe("http://x/");
    expect(webLinkTarget("https://example.com/a?b=c#d")).toBe("https://example.com/a?b=c#d");
  });

  it("refuses every other scheme", () => {
    expect(webLinkTarget("file:///etc/passwd")).toBeNull();
    expect(webLinkTarget("javascript:alert(1)")).toBeNull();
    expect(webLinkTarget("vscode://x")).toBeNull();
    expect(webLinkTarget("data:text/html,<b>x</b>")).toBeNull();
  });

  it("refuses what doesn't parse", () => {
    expect(webLinkTarget("https://")).toBeNull();
    expect(webLinkTarget("not a url")).toBeNull();
    expect(webLinkTarget("")).toBeNull();
  });
});

describe("linkAction", () => {
  it("opens a web link, and refuses anything else", () => {
    expect(linkAction("https://example.com", { canHover: true })).toEqual({
      kind: "open",
      href: "https://example.com/",
    });
    expect(linkAction("javascript:alert(1)", { shownText: "docs", canHover: true })).toEqual({ kind: "refuse" });
    expect(linkAction("file:///etc/passwd", { canHover: false })).toEqual({ kind: "refuse" });
  });

  it("opens an OSC 8 link straight away where the pointer could hover it", () => {
    expect(linkAction("https://example.com", { shownText: "text", canHover: true })).toEqual({
      kind: "open",
      href: "https://example.com/",
    });
  });

  it("asks, naming the host, when a tap can't have shown the target and the text differs", () => {
    expect(linkAction("https://example.com/x", { shownText: "text", canHover: false })).toEqual({
      kind: "ask",
      href: "https://example.com/x",
      host: "example.com",
    });
  });

  it("doesn't ask when the text is the address, or for a plain URL", () => {
    expect(linkAction("https://example.com", { shownText: "https://example.com", canHover: false }).kind).toBe("open");
    expect(linkAction("https://example.com", { canHover: false }).kind).toBe("open");
  });
});
