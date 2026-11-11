import { createReadStream } from "fs";
import { StringDecoder } from "string_decoder";
import { createBrotliDecompress } from "zlib";

/**
 * The pinned release's package list, `packages.json.br`, searched locally.
 *
 * `nix search` evaluates all of nixpkgs (minutes and gigabytes); the
 * release's own list is one file. Unpacked it is about 380 MB of JSON, and
 * parsing it whole costs about 1.6 GB, more than a small VPS has. So it is
 * read as a stream: each package's object is cut out by depth and parsed on
 * its own, and only what the pane shows is kept, about 14 MB for the whole
 * list.
 */

/** One package: [attr, pname, version, description, unfree]. */
export type PackageRow = [string, string, string, string, 0 | 1];

export interface SearchResult {
  attr: string;
  pname: string;
  version: string;
  description: string;
  unfree: boolean;
}

/** Descriptions are cut to this, which is more than a result line shows. */
const DESCRIPTION_MAX = 200;

/**
 * A nixpkgs attribute path the pane may install: letters, digits and
 * `_ + - .`, nothing that a shell or Nix would read as more than a name.
 */
export function isValidAttr(attr: unknown): attr is string {
  return (
    typeof attr === "string" &&
    attr.length > 0 &&
    attr.length <= 200 &&
    /^[A-Za-z0-9_+-]+(\.[A-Za-z0-9_+-]+)*$/.test(attr)
  );
}

interface RawPackage {
  pname?: unknown;
  version?: unknown;
  system?: unknown;
  meta?: {
    description?: unknown;
    available?: unknown;
    license?: unknown;
  };
}

/**
 * What a package becomes in the index, or null for one left out: other
 * systems than `x86_64-linux`, and packages Nix won't evaluate here (broken,
 * insecure, unsupported). Unfree ones stay: the list was made without
 * allowing them, so they read as unavailable, and this machine allows them.
 */
export function toRow(attr: string, p: RawPackage): PackageRow | null {
  if (p.system !== "x86_64-linux") return null;
  const meta = p.meta ?? {};
  const licenses = Array.isArray(meta.license) ? meta.license : [meta.license];
  const unfree = licenses.some((l) => typeof l === "object" && l !== null && (l as { free?: unknown }).free === false);
  if (meta.available === false && !unfree) return null;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return [
    attr,
    text(p.pname),
    text(p.version),
    text(meta.description).replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX),
    unfree ? 1 : 0,
  ];
}

/**
 * Cuts `{"packages": {"<attr>": {...}, ...}}` into one package object at a
 * time, from text arriving in pieces. A depth count that skips over strings
 * is enough: the list is well-formed JSON from the release.
 */
export class PackageScanner {
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** The last string closed at depth 2: the attribute a value belongs to. */
  private key = "";
  private keyBuf: string[] | null = null;
  /** The current package object's text, while inside one. */
  private body: string[] = [];
  private bodyStart = -1;

  constructor(private readonly onPackage: (attr: string, json: string) => void) {}

  push(chunk: string): void {
    let segStart = this.bodyStart >= 0 ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
        } else if (c === 0x5c /* \ */) {
          this.escaped = true;
        } else if (c === 0x22 /* " */) {
          this.inString = false;
          if (this.keyBuf) {
            this.key = this.keyBuf.join("");
            this.keyBuf = null;
          }
          continue;
        }
        if (this.keyBuf) this.keyBuf.push(chunk[i]);
        continue;
      }
      if (c === 0x22) {
        this.inString = true;
        // A string opened directly inside `packages` is an attribute name.
        if (this.depth === 2) this.keyBuf = [];
      } else if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
        this.depth++;
        if (this.depth === 3 && c === 0x7b) {
          this.bodyStart = i;
          segStart = i;
          this.body = [];
        }
      } else if (c === 0x7d /* } */ || c === 0x5d /* ] */) {
        if (this.depth === 3 && this.bodyStart >= 0) {
          this.body.push(chunk.slice(segStart, i + 1));
          this.onPackage(this.key, this.body.join(""));
          this.body = [];
          this.bodyStart = -1;
          segStart = -1;
        }
        this.depth--;
      }
    }
    if (this.bodyStart >= 0 && segStart >= 0) {
      this.body.push(chunk.slice(segStart));
      this.bodyStart = 0;
    }
  }
}

/** Read the release's `packages.json.br` into rows, streaming. */
export function buildIndex(brPath: string): Promise<PackageRow[]> {
  return new Promise((resolve, reject) => {
    const rows: PackageRow[] = [];
    const scanner = new PackageScanner((attr, json) => {
      let p: RawPackage;
      try {
        p = JSON.parse(json) as RawPackage;
      } catch {
        return;
      }
      const row = toRow(attr, p);
      if (row) rows.push(row);
    });
    const decoder = new StringDecoder("utf8");
    const stream = createReadStream(brPath).pipe(createBrotliDecompress());
    stream.on("data", (chunk: Buffer) => scanner.push(decoder.write(chunk)));
    stream.on("end", () => {
      scanner.push(decoder.end());
      resolve(rows);
    });
    stream.on("error", reject);
  });
}

/**
 * Find packages for a query: every word must appear in the attribute, the
 * name or the description. Names that match exactly come first, then names
 * that start with the query, then other name matches, then description
 * matches; shorter attributes first within each.
 */
export function searchIndex(rows: readonly PackageRow[], query: string, limit: number): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const q = words.join(" ");
  const scored: { row: PackageRow; score: number }[] = [];
  for (const row of rows) {
    const attr = row[0].toLowerCase();
    const pname = row[1].toLowerCase();
    const desc = row[3].toLowerCase();
    if (!words.every((w) => attr.includes(w) || pname.includes(w) || desc.includes(w))) continue;
    let score = 0;
    if (attr === q || pname === q) score = 100;
    else if (attr.startsWith(q) || pname.startsWith(q)) score = 60;
    else if (attr.includes(q) || pname.includes(q)) score = 30;
    else score = 10;
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row[0].length - b.row[0].length || (a.row[0] < b.row[0] ? -1 : 1));
  return scored.slice(0, limit).map(({ row }) => ({
    attr: row[0],
    pname: row[1],
    version: row[2],
    description: row[3],
    unfree: row[4] === 1,
  }));
}
