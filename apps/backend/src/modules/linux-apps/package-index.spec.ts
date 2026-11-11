import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { brotliCompressSync } from "zlib";
import { buildIndex, isValidAttr, PackageScanner, searchIndex, toRow, type PackageRow } from "./package-index";

const pkg = (pname: string, description: string, extra: object = {}) => ({
  meta: { available: true, description, license: { free: true }, ...extra },
  name: `${pname}-1.0`,
  pname,
  system: "x86_64-linux",
  version: "1.0",
});

const list = {
  packages: {
    firefox: pkg("firefox", "Web browser built from Firefox source tree"),
    "firefox-esr": pkg("firefox-esr", "Web browser, extended support"),
    gimp: pkg("gimp", "GNU Image Manipulation Program"),
    vscode: pkg("vscode", "Code editor developed by Microsoft", {
      available: false,
      license: { free: false, shortName: "unfree" },
    }),
    "broken-thing": pkg("broken-thing", "Does not build", { available: false }),
    "i686.thing": { ...pkg("thing", "Old"), system: "i686-linux" },
    "CuboCore.corefm": pkg("corefm", 'A file manager with "quotes" and {braces}'),
  },
  version: 2,
};

describe("the package index", () => {
  it("cuts packages out of the list across any split of the text", () => {
    const text = JSON.stringify(list);
    for (const step of [1, 7, 64, text.length]) {
      const seen: string[] = [];
      const scanner = new PackageScanner((attr, json) => {
        seen.push(attr);
        expect((JSON.parse(json) as { pname?: string }).pname).toBeTruthy();
      });
      for (let i = 0; i < text.length; i += step) scanner.push(text.slice(i, i + step));
      expect(seen).toEqual(Object.keys(list.packages));
    }
  });

  it("keeps x86_64-linux packages, unfree ones marked, and drops what will not evaluate", () => {
    const rows = Object.entries(list.packages)
      .map(([a, p]) => toRow(a, p))
      .filter(Boolean);
    expect(rows.map((r) => r![0])).toEqual(["firefox", "firefox-esr", "gimp", "vscode", "CuboCore.corefm"]);
    expect(rows.find((r) => r![0] === "vscode")![4]).toBe(1);
    expect(rows.find((r) => r![0] === "gimp")![4]).toBe(0);
  });

  it("builds the rows from the compressed release file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "linux-apps-index-"));
    try {
      const br = join(dir, "packages.json.br");
      writeFileSync(br, brotliCompressSync(Buffer.from(JSON.stringify(list))));
      const rows = await buildIndex(br);
      expect(rows.map((r) => r[0])).toEqual(["firefox", "firefox-esr", "gimp", "vscode", "CuboCore.corefm"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ranks exact names first, then prefixes, then descriptions, and caps the results", () => {
    const rows = Object.entries(list.packages)
      .map(([a, p]) => toRow(a, p))
      .filter((r): r is PackageRow => r !== null);
    expect(searchIndex(rows, "firefox", 50).map((r) => r.attr)).toEqual(["firefox", "firefox-esr"]);
    expect(searchIndex(rows, "browser", 50).map((r) => r.attr)).toEqual(["firefox", "firefox-esr"]);
    expect(searchIndex(rows, "image program", 50)[0]).toMatchObject({
      attr: "gimp",
      unfree: false,
    });
    expect(searchIndex(rows, "vscode", 50)[0]).toMatchObject({
      attr: "vscode",
      unfree: true,
    });
    expect(searchIndex(rows, "e", 2)).toHaveLength(2);
    expect(searchIndex(rows, "   ", 50)).toEqual([]);
  });

  it("takes only plain attribute paths as package names", () => {
    expect(isValidAttr("firefox")).toBe(true);
    expect(isValidAttr("CuboCore.corefm")).toBe(true);
    expect(isValidAttr("gtk+3")).toBe(true);
    for (const bad of ["", "a b", "a;rm -rf", "../x", "a..b", ".a", "a.", "nixpkgs#x", "$(x)", "x".repeat(201), 7]) {
      expect(isValidAttr(bad)).toBe(false);
    }
  });
});
