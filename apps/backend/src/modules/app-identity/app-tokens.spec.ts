import { APP_TOKEN_IDLE_MS, AppTokens, MAX_APP_TOKENS } from "./app-tokens";
import type { AppIdentity } from "./app-identity.types";

const token = (n: number) => n.toString(16).padStart(64, "0");

function copy(appId: string, instanceId: string): AppIdentity {
  return { appId, instanceId, windowId: instanceId, groups: [appId, "system"] };
}

describe("AppTokens", () => {
  it("maps a token to its app and running copy, under its session", () => {
    const tokens = new AppTokens();
    expect(tokens.register(token(1), "sid-a", copy("notepad", "w1"))).toBe("registered");
    expect(tokens.resolve(token(1), "sid-a")).toEqual(copy("notepad", "w1"));
  });

  it("a token dies with its copy", () => {
    const tokens = new AppTokens();
    tokens.register(token(1), "sid-a", copy("notepad", "w1"));
    tokens.register(token(2), "sid-a", copy("notepad", "w2"));
    tokens.revoke(token(1));
    expect(tokens.resolve(token(1), "sid-a")).toBeNull();
    tokens.revokeInstance("sid-a", "w2");
    expect(tokens.resolve(token(2), "sid-a")).toBeNull();
  });

  it("refuses a token under another session, so it dies with its own", () => {
    const tokens = new AppTokens();
    tokens.register(token(1), "sid-a", copy("notepad", "w1"));
    expect(tokens.resolve(token(1), "sid-b")).toBeNull();
    // Still the original session's.
    expect(tokens.resolve(token(1), "sid-a")).not.toBeNull();
  });

  it("refuses a forged, malformed or idle token", () => {
    const tokens = new AppTokens();
    const live = token(0xabcdef);
    tokens.register(live, "sid-a", copy("notepad", "w1"), 0);
    expect(tokens.resolve(token(9), "sid-a", 1)).toBeNull();
    expect(tokens.resolve("not-a-token", "sid-a", 1)).toBeNull();
    expect(tokens.resolve(live.toUpperCase(), "sid-a", 1)).toBeNull();
    // Used just inside the window, so it lives on from there.
    expect(tokens.resolve(live, "sid-a", APP_TOKEN_IDLE_MS)).not.toBeNull();
    expect(tokens.resolve(live, "sid-a", 2 * APP_TOKEN_IDLE_MS + 1)).toBeNull();
    expect(tokens.size).toBe(0);
  });

  it("one token per copy: registering again replaces the old one", () => {
    const tokens = new AppTokens();
    tokens.register(token(1), "sid-a", copy("notepad", "w1"));
    tokens.register(token(2), "sid-a", copy("notepad", "w1"));
    expect(tokens.resolve(token(1), "sid-a")).toBeNull();
    expect(tokens.resolve(token(2), "sid-a")?.instanceId).toBe("w1");
  });

  it("a token already registered is taken and changes nothing", () => {
    const tokens = new AppTokens();
    tokens.register(token(1), "sid-a", copy("notepad", "w1"));
    expect(tokens.register(token(1), "sid-a", copy("paint", "w2"))).toBe("taken");
    expect(tokens.resolve(token(1), "sid-a")?.appId).toBe("notepad");
  });

  it("refuses to register a token that is not 32 bytes of hex", () => {
    const tokens = new AppTokens();
    expect(() => tokens.register("short", "sid-a", copy("notepad", "w1"))).toThrow(/64 lowercase hex/);
  });

  it("drops the least recently used past the cap", () => {
    const tokens = new AppTokens();
    for (let i = 0; i < MAX_APP_TOKENS; i++) {
      tokens.register(token(i), "sid-a", copy("notepad", `w${i}`), i);
    }
    // Touch the oldest, so the second oldest goes instead.
    tokens.resolve(token(0), "sid-a", MAX_APP_TOKENS);
    tokens.register(token(MAX_APP_TOKENS), "sid-a", copy("notepad", "new"), MAX_APP_TOKENS);
    expect(tokens.size).toBe(MAX_APP_TOKENS);
    expect(tokens.resolve(token(0), "sid-a", MAX_APP_TOKENS)).not.toBeNull();
    expect(tokens.resolve(token(1), "sid-a", MAX_APP_TOKENS)).toBeNull();
  });

  it("ends every copy of an app, and lists a session’s copies", () => {
    const tokens = new AppTokens();
    tokens.register(token(1), "sid-a", copy("notepad", "w1"));
    tokens.register(token(2), "sid-a", copy("paint", "w2"));
    tokens.register(token(3), "sid-b", copy("notepad", "w3"));
    expect(tokens.instances("sid-a").map((i) => i.instanceId)).toEqual(["w1", "w2"]);
    tokens.revokeApp("notepad");
    expect(tokens.instances("sid-a").map((i) => i.appId)).toEqual(["paint"]);
    expect(tokens.instances("sid-b")).toEqual([]);
  });

  it("hands out a frozen identity a module cannot change", () => {
    const tokens = new AppTokens();
    tokens.register(token(1), "sid-a", copy("notepad", "w1"));
    const identity = tokens.resolve(token(1), "sid-a")!;
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.groups)).toBe(true);
  });
});
