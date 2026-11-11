import { promises as fs } from "fs";
import type { PackageRow } from "./package-index";

/**
 * The nixpkgs pins Linux apps install from, and the record of moving them.
 *
 * The image sets one pin (`nixpkgs-pin.env`, the system flake registry). The
 * Updates page moves it at runtime by writing the user flake registry, which
 * Nix reads before the system one and which lives on the /nix volume. Only
 * the current pin and the one before it are kept; an image whose own pin is
 * newer than the moved one wins.
 */

/** A release snapshot: `nixos-26.05`, `nixos-26.05.13627.c56a87d8e41c`, its commit. */
export interface Pin {
  release: string;
  snapshot: string;
  commit: string;
}

/** The pin left behind by a move, with the profile generations holding its apps. */
export interface KeptPin extends Pin {
  /** The user profile's generation, or null when it had none. */
  generation: number | null;
  /** Xwayland's profile's generation, or null when Xwayland wasn't installed. */
  xwaylandGeneration: number | null;
}

/** `pins.json` on the /nix volume. */
export interface PinState {
  /** Where the last Update or Go back moved the pin; null means the image's pin. */
  current: Pin | null;
  /** The pin before it, which Go back returns to. */
  previous: KeptPin | null;
  /** When Check last ran. */
  checkedAt: number | null;
  /** What that check found on the current release's channel, and on a newer release's. */
  update: Pin | null;
  upgrade: Pin | null;
}

export const EMPTY_STATE: PinState = {
  current: null,
  previous: null,
  checkedAt: null,
  update: null,
  upgrade: null,
};

const RELEASE = /^nixos-(\d{2})\.(\d{2})$/;
const SNAPSHOT = /^nixos-(\d{2})\.(\d{2})\.(\d{1,9})\.([0-9a-f]{12})$/;
const COMMIT = /^[0-9a-f]{40}$/;

export function isCommit(value: unknown): value is string {
  return typeof value === "string" && COMMIT.test(value);
}

/**
 * A snapshot's name, taken apart: release `nixos-26.05`, build 13627 (the
 * release branch's commit count, so it only grows) and the short commit.
 */
export function parseSnapshot(name: string): {
  release: string;
  year: number;
  month: number;
  build: number;
  short: string;
} | null {
  const m = SNAPSHOT.exec(name);
  if (!m) return null;
  return {
    release: `nixos-${m[1]}.${m[2]}`,
    year: Number(m[1]),
    month: Number(m[2]),
    build: Number(m[3]),
    short: m[4],
  };
}

/**
 * Which snapshot is newer: a later release first, then a later build on the
 * same release. Commits alone don't say; the snapshot's name does.
 */
export function compareSnapshots(a: string, b: string): number {
  const x = parseSnapshot(a);
  const y = parseSnapshot(b);
  if (!x || !y) return 0;
  return x.year - y.year || x.month - y.month || x.build - y.build;
}

/** NixOS releases come in May and November: 26.05 → 26.11 → 27.05. */
export function nextRelease(release: string): string | null {
  const m = RELEASE.exec(release);
  if (!m) return null;
  const year = Number(m[1]);
  return Number(m[2]) < 11 ? `nixos-${m[1]}.11` : `nixos-${String(year + 1).padStart(2, "0")}.05`;
}

/** A pin whose three parts agree with each other. */
export function isPin(value: unknown): value is Pin {
  const p = value as Partial<Pin> | null;
  if (!p || typeof p !== "object") return false;
  if (typeof p.snapshot !== "string" || !isCommit(p.commit)) return false;
  const s = parseSnapshot(p.snapshot);
  return !!s && s.release === p.release && p.commit.startsWith(s.short);
}

function generation(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * The state file, checked field by field: its commits reach Nix's arguments,
 * so anything that isn't exactly a pin reads as no pin.
 */
export function parsePinState(text: string): PinState {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ...EMPTY_STATE };
  }
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATE };
  const pin = (v: unknown): Pin | null =>
    isPin(v) ? { release: v.release, snapshot: v.snapshot, commit: v.commit } : null;
  const prev = raw.previous as Partial<KeptPin> | undefined;
  const previousPin = pin(prev);
  return {
    current: pin(raw.current),
    previous: previousPin
      ? {
          ...previousPin,
          generation: generation(prev?.generation),
          xwaylandGeneration: generation(prev?.xwaylandGeneration),
        }
      : null,
    checkedAt: typeof raw.checkedAt === "number" ? raw.checkedAt : null,
    update: pin(raw.update),
    upgrade: pin(raw.upgrade),
  };
}

export async function readPinState(file: string): Promise<PinState> {
  return parsePinState(await fs.readFile(file, "utf8").catch(() => ""));
}

export async function writePinState(file: string, state: PinState): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n");
  await fs.rename(tmp, file);
}

/** The image's pin, from `nixpkgs-pin.env`'s values, when they agree. */
export function imagePin(values: Record<string, string>): Pin | null {
  const pin = {
    release: values.NIXPKGS_RELEASE ?? "",
    snapshot: values.NIXPKGS_SNAPSHOT ?? "",
    commit: values.NIXPKGS_COMMIT ?? "",
  };
  return isPin(pin) ? pin : null;
}

/**
 * The pin Nix installs from: the moved one, unless the image's own is at
 * least as new (an image with a newer pin wins).
 */
export function effectivePin(image: Pin | null, state: PinState): { pin: Pin | null; fromImage: boolean } {
  const moved = state.current;
  if (moved && (!image || compareSnapshots(moved.snapshot, image.snapshot) > 0))
    return { pin: moved, fromImage: false };
  return { pin: image, fromImage: true };
}

export interface VersionChange {
  name: string;
  from: string;
  to: string;
}

export interface VersionDiff {
  /** Apps whose version changes, old → new. */
  changes: VersionChange[];
  /** Apps the newer list doesn't have; they stay as they are. */
  missing: string[];
  /** Apps rebuilt at the same version. */
  rebuilt: number;
}

/**
 * What moving to another pin does to the installed apps, from the two
 * release lists: an app's version on each side, by its attribute. The
 * installed version is the fallback for an app the old list doesn't have.
 */
export function diffVersions(
  installed: readonly { name: string; attr: string; version: string }[],
  from: ReadonlyMap<string, PackageRow>,
  to: ReadonlyMap<string, PackageRow>,
): VersionDiff {
  const out: VersionDiff = { changes: [], missing: [], rebuilt: 0 };
  for (const app of installed) {
    const next = to.get(app.attr);
    if (!next) {
      out.missing.push(app.name);
      continue;
    }
    const was = from.get(app.attr)?.[2] ?? app.version;
    if (was === next[2]) out.rebuilt++;
    else out.changes.push({ name: app.name, from: was, to: next[2] });
  }
  return out;
}

/** The rows of a list, by attribute, for only the attributes asked about. */
export function rowsByAttr(rows: readonly PackageRow[], attrs: ReadonlySet<string>): Map<string, PackageRow> {
  const out = new Map<string, PackageRow>();
  for (const row of rows) if (attrs.has(row[0])) out.set(row[0], row);
  return out;
}
