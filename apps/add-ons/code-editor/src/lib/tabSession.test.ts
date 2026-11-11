import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimTabSession, forgetTabSession, loadTabSession, resetTabSessionClaim, saveTabSession } from "./tabSession";

const KEY = "imbatranimos:code-editor:tabs";

function fakeSessionStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", fakeSessionStorage());
  resetTabSessionClaim();
});

describe("saveTabSession / loadTabSession", () => {
  it("round-trips each window’s tab list", () => {
    saveTabSession("w1", [
      { root: "home", path: "src/a.ts" },
      { root: "notes", path: "b.md" },
    ]);
    saveTabSession("w2", [{ root: "home", path: "big.log" }]);
    expect(loadTabSession()).toEqual([
      [
        { root: "home", path: "src/a.ts" },
        { root: "notes", path: "b.md" },
      ],
      [{ root: "home", path: "big.log" }],
    ]);
  });

  it("an empty set or a closed window drops that window only", () => {
    saveTabSession("w1", [{ root: "home", path: "a.ts" }]);
    saveTabSession("w2", [{ root: "home", path: "b.ts" }]);
    saveTabSession("w1", []);
    expect(loadTabSession()).toEqual([[{ root: "home", path: "b.ts" }]]);
    forgetTabSession("w2");
    expect(loadTabSession()).toEqual([]);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("returns an empty list when nothing was saved", () => {
    expect(loadTabSession()).toEqual([]);
  });

  it("survives a corrupt record rather than throwing at boot", () => {
    sessionStorage.setItem(KEY, "{not json");
    expect(loadTabSession()).toEqual([]);
  });

  it("drops entries that are not {root, path}", () => {
    // A record written by an older shape must not reach openPath as undefined,
    // which would fetch `/files/content?root=undefined`.
    sessionStorage.setItem(KEY, JSON.stringify({ w1: [{ root: "home" }, 42, null, { root: 1, path: 2 }], w2: "x" }));
    expect(loadTabSession()).toEqual([]);
  });

  it("reads the older one shared list as one window’s", () => {
    sessionStorage.setItem(KEY, JSON.stringify([{ root: "home", path: "a.ts" }]));
    expect(loadTabSession()).toEqual([[{ root: "home", path: "a.ts" }]]);
  });

  it("does not throw when storage refuses the write", () => {
    vi.stubGlobal("sessionStorage", {
      ...fakeSessionStorage(),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    } as Storage);
    expect(() => saveTabSession("w1", [{ root: "home", path: "a.ts" }])).not.toThrow();
  });
});

describe("claimTabSession", () => {
  it("gives each window that comes back after a reload one window’s tabs", () => {
    // Before the reload: two editor windows.
    saveTabSession("old-1", [
      { root: "home", path: "a.ts" },
      { root: "home", path: "b.ts" },
    ]);
    saveTabSession("old-2", [{ root: "home", path: "big.log" }]);
    // After it, two windows with new ids mount.
    const first = claimTabSession("new-1");
    const second = claimTabSession("new-2");
    expect([first, second]).toEqual([
      [
        { root: "home", path: "a.ts" },
        { root: "home", path: "b.ts" },
      ],
      [{ root: "home", path: "big.log" }],
    ]);
    // A third window has nothing to take; the claimed sets left the record.
    expect(claimTabSession("new-3")).toEqual([]);
    expect(loadTabSession()).toEqual([]);
  });

  it("answers a window asking again the same, never a second window’s set", () => {
    saveTabSession("old-1", [{ root: "home", path: "a.ts" }]);
    saveTabSession("old-2", [{ root: "home", path: "b.ts" }]);
    expect(claimTabSession("w")).toEqual([{ root: "home", path: "a.ts" }]);
    expect(claimTabSession("w")).toEqual([{ root: "home", path: "a.ts" }]);
    expect(claimTabSession("v")).toEqual([{ root: "home", path: "b.ts" }]);
  });

  it("a set the running editor records after the first claim is not handed to a later window", () => {
    expect(claimTabSession("w1")).toEqual([]);
    saveTabSession("w1", [{ root: "home", path: "a.ts" }]);
    expect(claimTabSession("w2")).toEqual([]);
  });
});
