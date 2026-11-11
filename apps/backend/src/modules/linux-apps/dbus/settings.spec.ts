import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APPEARANCE, APPEARANCE_PREF, SETTINGS, STRONG, SettingsServer, appearanceFrom } from "./settings";
import { MessageType, Variant, marshal, unmarshal, type Message } from "./wire";

const stored = (state: object) => JSON.stringify({ state, version: 1 });

function setup(raw: string | null = null) {
  const signals: Parameters<ConstructorParameters<typeof SettingsServer>[0]>[0][] = [];
  const server = new SettingsServer((m) => signals.push(m), raw);
  return { server, signals };
}

const call = (member: string, signature?: string, body: unknown[] = []): Message => ({
  type: MessageType.MethodCall,
  flags: 0,
  serial: 1,
  path: SETTINGS.path,
  interface: member.startsWith("Get") ? "org.freedesktop.DBus.Properties" : SETTINGS.interface,
  member,
  signature,
  body,
});

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

describe("the appearance values", () => {
  it("reads Apricot light with its default accent when nothing is saved", () => {
    expect(appearanceFrom(null)).toEqual({
      "color-scheme": 2,
      "accent-color": rgb("#a04b23"),
      contrast: 0,
    });
    expect(appearanceFrom("not json")["color-scheme"]).toBe(2);
  });

  it.each(
    Object.entries(STRONG).flatMap(([theme, presets]) =>
      Object.entries(presets).flatMap(([id, [light, dark]]) => [
        [theme, id, "light", light],
        [theme, id, "dark", dark],
      ]),
    ),
  )("maps %s %s in %s mode to its strong colour %s", (theme, id, mode, hex) => {
    const a = appearanceFrom(stored({ theme, mode, accents: { [theme]: id } }));
    expect(a["color-scheme"]).toBe(mode === "dark" ? 1 : 2);
    expect(a["accent-color"]).toEqual(rgb(hex));
    expect(a.contrast).toBe(0);
  });

  it("uses the accent chosen in the current theme, and its default when the id is gone", () => {
    const accents = { apricot: "sky", classic: "cobalt" };
    expect(appearanceFrom(stored({ theme: "classic", mode: "light", accents }))["accent-color"]).toEqual(
      rgb("#1f5fd6"),
    );
    expect(
      appearanceFrom(stored({ theme: "classic", mode: "light", accents: { classic: "x" } }))["accent-color"],
    ).toEqual(rgb("#c0263a"));
  });

  it("reads a blob from before themes, whose theme is the mode", () => {
    const a = appearanceFrom(stored({ theme: "dark", accent: "cobalt" }));
    expect(a["color-scheme"]).toBe(1);
    expect(a["accent-color"]).toEqual(rgb("#f2a97e"));
  });

  it("stays in step with the desktop appearance store", () => {
    const src = readFileSync(join(__dirname, "../../../../../core/src/shared/store/appearanceStore.ts"), "utf8");
    const table: Record<string, Record<string, [string, string]>> = {
      apricot: {},
      classic: {},
    };
    for (const m of src.matchAll(/apricot\('(\w+)', '[^']+', '(#\w+)', '(#\w+)'\)/g)) {
      table.apricot[m[1]] = [m[3], m[2]];
    }
    for (const m of src.matchAll(/classic\('(\w+)', '[^']+', '(#\w+)'\)/g)) {
      if (m[1] === "id") continue;
      table.classic[m[1]] = [m[2], m[2]];
    }
    expect(STRONG).toEqual(table);
  });
});

describe("the settings service", () => {
  const dark = stored({ theme: "apricot", mode: "dark", accents: {} });

  it("answers ReadOne with the value in one variant", () => {
    const { server } = setup(dark);
    const r = server.handle(call("ReadOne", "ss", [APPEARANCE, "color-scheme"]));
    expect(r).toEqual({ signature: "v", body: [new Variant("u", 1)] });
    const accent = server.handle(call("ReadOne", "ss", [APPEARANCE, "accent-color"])) as { body: Variant[] };
    expect(accent.body[0].signature).toBe("(ddd)");
  });

  it("answers the deprecated Read with an extra variant around it", () => {
    const { server } = setup(dark);
    const r = server.handle(call("Read", "ss", [APPEARANCE, "contrast"]));
    expect(r).toEqual({
      signature: "v",
      body: [new Variant("v", new Variant("u", 0))],
    });
  });

  it("answers ReadAll as a{sa{sv}} that survives the wire", () => {
    const { server } = setup(dark);
    const r = server.handle(call("ReadAll", "as", [[]])) as {
      signature: string;
      body: unknown[];
    };
    expect(r.signature).toBe("a{sa{sv}}");
    const back = unmarshal(r.signature, marshal(r.signature, r.body)) as [[string, [string, Variant][]][]];
    expect(back[0][0][0]).toBe(APPEARANCE);
    expect(back[0][0][1].map(([k, v]) => [k, v.signature])).toEqual([
      ["color-scheme", "u"],
      ["accent-color", "(ddd)"],
      ["contrast", "u"],
    ]);
    expect(back[0][0][1][0][1].value).toBe(1);
  });

  it("matches ReadAll namespace patterns, and answers another namespace empty", () => {
    const { server } = setup();
    const count = (patterns: string[]) =>
      (
        server.handle(call("ReadAll", "as", [patterns])) as {
          body: unknown[][];
        }
      ).body[0].length;
    expect(count(["org.freedesktop.appearance"])).toBe(1);
    expect(count(["org.freedesktop.*"])).toBe(1);
    expect(count(["org.gnome.desktop.interface"])).toBe(0);
    expect(count(["org.gnome.*"])).toBe(0);
  });

  it("says NotFound for a setting it does not have", () => {
    const { server } = setup();
    expect(server.handle(call("ReadOne", "ss", ["org.gnome.x", "y"]))).toMatchObject({
      error: "org.freedesktop.portal.Error.NotFound",
    });
    expect(server.handle(call("ReadOne", "ss", [APPEARANCE, "nope"]))).toMatchObject({
      error: "org.freedesktop.portal.Error.NotFound",
    });
  });

  it("has version 2, and refuses wrong arguments", () => {
    const { server } = setup();
    expect(server.handle(call("Get", "ss", [SETTINGS.interface, "version"]))).toEqual({
      signature: "v",
      body: [new Variant("u", 2)],
    });
    expect(server.handle(call("ReadOne", "s", ["x"]))).toMatchObject({
      error: "org.freedesktop.DBus.Error.InvalidArgs",
    });
    expect(server.handle(call("Frobnicate"))).toBeUndefined();
  });

  it("signals each key that changed, and nothing for a write that changes none", () => {
    const { server, signals } = setup();
    server.update(stored({ theme: "apricot", mode: "dark", accents: {} }));
    expect(signals.map((s) => [s.member, s.body![1]])).toEqual([
      ["SettingChanged", "color-scheme"],
      ["SettingChanged", "accent-color"],
    ]);
    expect(signals[0]).toMatchObject({
      path: SETTINGS.path,
      interface: SETTINGS.interface,
      signature: "ssv",
      body: [APPEARANCE, "color-scheme", new Variant("u", 1)],
    });
    signals.length = 0;
    server.update(stored({ theme: "apricot", mode: "dark", accents: {} }));
    expect(signals).toEqual([]);
    server.update(stored({ theme: "apricot", mode: "dark", accents: { apricot: "rose" } }));
    expect(signals.map((s) => s.body![1])).toEqual(["accent-color"]);
    server.update(null);
    expect(signals.map((s) => s.body![1])).toEqual(["accent-color", "color-scheme", "accent-color"]);
  });

  it("names the appearance dotfile", () => {
    expect(APPEARANCE_PREF).toBe("imbatranimos:appearance");
  });
});
