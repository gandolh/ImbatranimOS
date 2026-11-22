// Records a command's terminal output, with its timing, as an asciicast v2 file (asciinema's format):
//
//   node scripts/bench/record.mjs <name> [--cols 120] [--rows 40] [--keys <text>] [--every <ms>] -- <command...>
//
// The command runs under a real PTY (node-pty, taken from the backend workspace that owns it), and the cast
// lands in <bench folder>/recordings/<name>.cast; its sha256 is printed. `--keys` types text into it once
// it starts, one character every `--every` ms (default 50), for a program that needs input, such as an
// editor scrolling: escapes like \x06 are read as such.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchDir } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pty = createRequire(path.join(root, "apps/backend/package.json"))("node-pty");

/** Spawns `command` under a PTY and resolves with its asciicast v2 text when it exits. */
export function record(command, { cols = 120, rows = 40, keys = "", every = 50, env = process.env } = {}) {
  const [file, ...args] = command;
  const started = Date.now();
  const header = {
    version: 2,
    width: cols,
    height: rows,
    timestamp: Math.floor(started / 1000),
    command: command.join(" "),
    env: { TERM: "xterm-256color", SHELL: env.SHELL ?? "/bin/sh" },
  };
  const lines = [JSON.stringify(header)];
  const at = () => Number(((Date.now() - started) / 1000).toFixed(6));
  return new Promise((resolve) => {
    const child = pty.spawn(file, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: process.cwd(),
      env: { ...env, TERM: "xterm-256color" },
    });
    child.onData((data) => lines.push(JSON.stringify([at(), "o", data])));
    child.onExit(() => resolve(`${lines.join("\n")}\n`));
    [...keys].forEach((ch, i) =>
      setTimeout(
        () => {
          lines.push(JSON.stringify([at(), "i", ch]));
          child.write(ch);
        },
        500 + i * every,
      ),
    );
  });
}

/** `--keys` text with \xNN, \r and \n escapes read. */
function unescape(text) {
  return text.replace(/\\x([0-9a-fA-F]{2})|\\r|\\n/g, (m, hex) =>
    hex ? String.fromCharCode(parseInt(hex, 16)) : m === "\\r" ? "\r" : "\n",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dash = argv.indexOf("--");
  const [name, ...flags] = dash < 0 ? argv : argv.slice(0, dash);
  const command = dash < 0 ? [] : argv.slice(dash + 1);
  if (!name || command.length === 0) {
    process.stderr.write("usage: record.mjs <name> [--cols N] [--rows N] [--keys TEXT] [--every MS] -- <command...>\n");
    process.exit(2);
  }
  const flag = (f, d) => (flags.includes(f) ? flags[flags.indexOf(f) + 1] : d);
  const cast = await record(command, {
    cols: Number(flag("--cols", 120)),
    rows: Number(flag("--rows", 40)),
    keys: unescape(flag("--keys", "")),
    every: Number(flag("--every", 50)),
  });
  const dir = path.join(benchDir(), "recordings");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${name}.cast`);
  writeFileSync(out, cast);
  const sum = createHash("sha256").update(readFileSync(out)).digest("hex");
  process.stdout.write(`${sum}  recordings/${name}.cast  (${cast.length} bytes)\n`);
  process.exit(0);
}
