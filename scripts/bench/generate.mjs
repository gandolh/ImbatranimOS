// The synthetic inputs for the Terminal path, made from fixed seeds:
//
//   node scripts/bench/generate.mjs [plain|sgr|cjk ...]
//
// writes each file into the bench folder (lib.mjs) and prints its size and sha256. The recipe page
// (corpus/wiki/how-we-measure.md) lists the sums to expect, so a different machine can check it has the
// same bytes before comparing numbers.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchDir, int, rng } from "./lib.mjs";

const MB = 1024 * 1024;

/** Each input: its file, its size, its seed and how a line is made. */
export const INPUTS = {
  plain: { file: "plain-50mb.txt", bytes: 50 * MB, seed: 0x5eed0001, line: plainLine },
  sgr: { file: "sgr-20mb.txt", bytes: 20 * MB, seed: 0x5eed0002, line: sgrLine },
  cjk: { file: "cjk-20mb.txt", bytes: 20 * MB, seed: 0x5eed0003, line: cjkLine },
};

const WORD = "abcdefghijklmnopqrstuvwxyz0123456789";

function word(next) {
  let w = "";
  for (let i = int(next, 2, 10); i > 0; i--) w += WORD[int(next, 0, WORD.length - 1)];
  return w;
}

/** Printable ASCII words, 20 to 120 characters a line. */
function plainLine(next) {
  const target = int(next, 20, 120);
  let line = "";
  while (line.length < target) line += (line ? " " : "") + word(next);
  return line.slice(0, target);
}

/** Words in 256-colour and truecolour, bold and underlined, each run reset. */
function sgrLine(next) {
  let line = "";
  for (let i = int(next, 4, 12); i > 0; i--) {
    const style = int(next, 0, 3);
    if (style === 0) line += `\x1b[38;5;${int(next, 0, 255)}m`;
    else if (style === 1) line += `\x1b[38;2;${int(next, 0, 255)};${int(next, 0, 255)};${int(next, 0, 255)}m`;
    else if (style === 2) line += `\x1b[1;48;5;${int(next, 0, 255)}m`;
    else line += "\x1b[4m";
    line += `${word(next)}\x1b[0m `;
  }
  return line;
}

/** ASCII mixed with CJK ideographs and emoji, which take two cells each. */
function cjkLine(next) {
  let line = "";
  for (let i = int(next, 6, 30); i > 0; i--) {
    const kind = int(next, 0, 2);
    if (kind === 0) line += `${word(next)} `;
    else if (kind === 1) line += String.fromCodePoint(int(next, 0x4e00, 0x9fff));
    else line += String.fromCodePoint(int(next, 0x1f300, 0x1f64f));
  }
  return line;
}

/** The bytes of one input: whole lines until the next would pass `bytes`. */
export function generate(spec, bytes = spec.bytes) {
  const next = rng(spec.seed);
  const chunks = [];
  let size = 0;
  for (;;) {
    const line = Buffer.from(`${spec.line(next)}\n`, "utf8");
    if (size + line.length > bytes) break;
    chunks.push(line);
    size += line.length;
  }
  return Buffer.concat(chunks, size);
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2);
  const dir = benchDir();
  mkdirSync(dir, { recursive: true });
  for (const [name, spec] of Object.entries(INPUTS)) {
    if (names.length > 0 && !names.includes(name)) continue;
    const bytes = generate(spec);
    const file = path.join(dir, spec.file);
    writeFileSync(file, bytes);
    process.stdout.write(`${sha256(bytes)}  ${spec.file}  (${bytes.length} bytes)\n`);
  }
}
