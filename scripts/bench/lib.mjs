// Shared by the bench scripts: where inputs live, and the seeded random numbers they are made from.
import { homedir } from "node:os";
import path from "node:path";

/** Inputs, recordings and results live here, never in the repo: `$XDG_CACHE_HOME/imbatranim-bench/`. */
export function benchDir(env = process.env) {
  const base = env.XDG_CACHE_HOME?.trim() || path.join(homedir(), ".cache");
  return path.join(base, "imbatranim-bench");
}

/** mulberry32: a small seeded generator, so an input is the same bytes on every machine and revision. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer from `lo` to `hi`, both included. */
export function int(next, lo, hi) {
  return lo + Math.floor(next() * (hi - lo + 1));
}
