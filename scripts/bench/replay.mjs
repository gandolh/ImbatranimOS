// Plays an asciicast v2 recording's output without its pauses:
//
//   node scripts/bench/replay.mjs <file.cast>        writes the output to stdout
//
// `castOutput` gives the same bytes to a workload that feeds them somewhere else (a Terminal, a parser).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Every output event's text, in order, joined: what the terminal received, minus the waiting. */
export function castOutput(text) {
  const [head, ...events] = text.split("\n").filter((l) => l.trim() !== "");
  const header = JSON.parse(head ?? "{}");
  if (header.version !== 2) throw new Error(`not an asciicast v2 file (version ${header.version})`);
  return events
    .map((l) => JSON.parse(l))
    .filter(([, kind]) => kind === "o")
    .map(([, , data]) => data)
    .join("");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: replay.mjs <file.cast>\n");
    process.exit(2);
  }
  process.stdout.write(castOutput(readFileSync(file, "utf8")));
}
