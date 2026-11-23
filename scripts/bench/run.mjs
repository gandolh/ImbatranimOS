// One runner for every measuring brief:
//
//   node scripts/bench/run.mjs <workload.mjs> [--warmups 2] [--runs 10]
//
// A workload module exports `name` and `run()`, which resolves with the milliseconds one run took (it
// measures its own span), plus optional `setup()` and `teardown()`. The runner does the warmups, then the
// runs, and prints the median and the 95th percentile with the machine and the CPU and memory cap beside
// them; the result is also saved under <bench folder>/results/. A lock file refuses a second run while one
// is going: two benchmarks on one machine measure each other.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { benchDir } from "./lib.mjs";

/** The nearest-rank percentile of ascending numbers, `p` from 0 to 1. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** Median and 95th percentile of `ms`, rounded to 0.1 ms. */
export function summarize(ms) {
  const sorted = [...ms].sort((a, b) => a - b);
  const round = (v) => Math.round(v * 10) / 10;
  return { runs: ms.length, median: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)) };
}

function readOr(file, fallback) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return fallback;
  }
}

/** The machine and the cap the numbers ran under, written beside them. */
export function machine() {
  const cpus = os.cpus();
  return {
    host: os.hostname(),
    cpu: cpus[0]?.model ?? "unknown",
    cpus: cpus.length,
    memoryGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
    // cgroup v2: "max 100000" is no CPU cap, "100000 100000" one CPU; memory.max in bytes or "max".
    cpuMax: readOr("/sys/fs/cgroup/cpu.max", "unreadable"),
    memoryMax: readOr("/sys/fs/cgroup/memory.max", "unreadable"),
  };
}

function isAlive(pid) {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Takes the lock, or throws if a live run holds it. */
function lock(dir) {
  const file = path.join(dir, "run.lock");
  if (existsSync(file)) {
    const pid = Number(readOr(file, "0"));
    if (isAlive(pid)) throw new Error(`another benchmark is running (pid ${pid}); never run two at once`);
    rmSync(file); // left by a run that died
  }
  closeSync(openSync(file, "wx"));
  writeFileSync(file, String(process.pid));
  return () => rmSync(file, { force: true });
}

export async function runWorkload(workload, { warmups = 2, runs = 10, log = () => undefined } = {}) {
  const dir = benchDir();
  mkdirSync(path.join(dir, "results"), { recursive: true });
  const unlock = lock(dir);
  try {
    await workload.setup?.();
    for (let i = 0; i < warmups; i++) log(`warmup ${i + 1}: ${(await workload.run()).toFixed(1)} ms`);
    const ms = [];
    for (let i = 0; i < runs; i++) {
      ms.push(await workload.run());
      log(`run ${i + 1}: ${ms.at(-1).toFixed(1)} ms`);
    }
    await workload.teardown?.();
    const result = { workload: workload.name, at: new Date().toISOString(), ...summarize(ms), ms, machine: machine() };
    writeFileSync(
      path.join(dir, "results", `${workload.name}-${result.at.replace(/[:.]/g, "-")}.json`),
      JSON.stringify(result, null, 2),
    );
    return result;
  } finally {
    unlock();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    process.stderr.write("usage: run.mjs <workload.mjs> [--warmups N] [--runs N]\n");
    process.exit(2);
  }
  const flag = (f, d) => (flags.includes(f) ? Number(flags[flags.indexOf(f) + 1]) : d);
  const workload = await import(pathToFileURL(path.resolve(file)).href);
  const result = await runWorkload(workload, {
    warmups: flag("--warmups", 2),
    runs: flag("--runs", 10),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
