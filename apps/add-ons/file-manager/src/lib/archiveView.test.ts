import { describe, expect, it } from "vitest";
import type { ArchiveEntry, ArchiveListing } from "../types";
import {
  archiveKind,
  crumbTarget,
  entryNamesFor,
  folderEntries,
  loneOutputName,
  normaliseEntryName,
  uniqueArchiveName,
} from "./archiveView";

function entry(name: string, size = 1, directory = false): ArchiveEntry {
  return { name, size, compressedSize: size, directory, modified: null, nameRepaired: false };
}

function listing(...names: (string | ArchiveEntry)[]): ArchiveListing {
  return {
    format: "zip",
    entries: names.map((n) => (typeof n === "string" ? entry(n) : n)),
    refused: [],
    encrypted: false,
    truncated: false,
  };
}

describe("archiveKind", () => {
  it("opens the tar and zip family like a folder", () => {
    for (const n of ["a.zip", "a.tar", "a.tar.gz", "a.TGZ", "a.tar.bz2", "a.tbz2", "a.tbz", "a.tar.xz", "a.txz"]) {
      expect(archiveKind(n)).toBe("browse");
    }
  });
  it("offers Extract for a lone compressed file", () => {
    for (const n of ["a.gz", "a.xz", "a.bz2", "notes.txt.gz"]) expect(archiveKind(n)).toBe("extract");
  });
  it("leaves other files alone", () => {
    expect(archiveKind("a.txt")).toBeNull();
    expect(archiveKind("zip")).toBeNull();
  });
});

describe("normaliseEntryName", () => {
  it("drops a leading ./ or / and a trailing /", () => {
    expect(normaliseEntryName("./a/b/")).toBe("a/b");
    expect(normaliseEntryName("/a")).toBe("a");
  });
});

describe("folderEntries", () => {
  const l = listing("top.txt", "docs/", "docs/a.md", "docs/sub/b.md", "bare/c.txt");

  it("lists the top level, making folders that names pass through", () => {
    const rows = folderEntries(l, "");
    expect(rows.map((r) => `${r.type}:${r.path}`).sort()).toEqual(["directory:bare", "directory:docs", "file:top.txt"]);
  });

  it("lists one folder inside", () => {
    const rows = folderEntries(l, "docs");
    expect(rows.map((r) => `${r.type}:${r.path}`).sort()).toEqual(["directory:docs/sub", "file:docs/a.md"]);
  });

  it("is empty for a folder the archive does not have", () => {
    expect(folderEntries(l, "nope")).toEqual([]);
  });

  it("does not mistake a longer name for the folder", () => {
    expect(folderEntries(listing("docs2/x.txt"), "docs")).toEqual([]);
  });
});

describe("entryNamesFor", () => {
  const l = listing("top.txt", "docs/", "docs/a.md", "docs/sub/b.md", "docs2/x.txt");

  it("takes a file as itself", () => {
    expect(entryNamesFor(l, ["top.txt"])).toEqual(["top.txt"]);
  });

  it("takes a folder with everything under it, as the archive spells the names", () => {
    expect(entryNamesFor(l, ["docs"])).toEqual(["docs/", "docs/a.md", "docs/sub/b.md"]);
  });

  it("takes a selection of several", () => {
    expect(entryNamesFor(l, ["top.txt", "docs/sub"])).toEqual(["top.txt", "docs/sub/b.md"]);
  });
});

describe("crumbTarget", () => {
  it("leaves the archive from a folder above it", () => {
    expect(crumbTarget("a/b/x.zip", "")).toEqual({ leave: true, path: "" });
    expect(crumbTarget("a/b/x.zip", "a/b")).toEqual({ leave: true, path: "a/b" });
  });
  it("stays inside from the archive or below", () => {
    expect(crumbTarget("a/x.zip", "a/x.zip")).toEqual({ leave: false, inner: "" });
    expect(crumbTarget("a/x.zip", "a/x.zip/d/e")).toEqual({ leave: false, inner: "d/e" });
  });
});

describe("uniqueArchiveName", () => {
  it("numbers a name that is taken", () => {
    expect(uniqueArchiveName("pics", [])).toBe("pics.zip");
    expect(uniqueArchiveName("pics", ["pics.zip"])).toBe("pics (2).zip");
    expect(uniqueArchiveName("pics", ["pics.zip", "pics (2).zip"])).toBe("pics (3).zip");
  });
});

describe("loneOutputName", () => {
  it("drops the suffix, as the backend names the file", () => {
    expect(loneOutputName("notes.txt.gz")).toBe("notes.txt");
    expect(loneOutputName("dump.SQL.XZ")).toBe("dump.SQL");
    expect(loneOutputName(".bashrc.bz2")).toBe(".bashrc");
  });

  it("is null for a tarball, another file, or nothing left", () => {
    expect(loneOutputName("src.tar.gz")).toBeNull();
    expect(loneOutputName("notes.txt")).toBeNull();
    expect(loneOutputName(".gz")).toBeNull();
  });
});
