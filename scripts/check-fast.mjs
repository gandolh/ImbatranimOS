// `npm run check:fast`: the typecheck of the workspaces that changed against HEAD (and the ones that depend on
// them), then ESLint on the files changed against HEAD and the untracked ones. Nothing else, and never tests, so it
// stays quick enough for the Stop hook. `npm run check` is the full gate.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const shell = process.platform === "win32";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
const files = [
  ...new Set([
    ...git("diff", "--name-only", "--relative", "HEAD"),
    ...git("ls-files", "--others", "--exclude-standard"),
  ]),
].filter((file) => /\.[cm]?[jt]sx?$/.test(file) && existsSync(file));

// turbo runs each workspace's own `typecheck` script, and its cache makes an unchanged one free.
const typecheck = spawnSync("npx", ["turbo", "typecheck", "--filter=...[HEAD]"], { stdio: "inherit", shell });
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1);

if (files.length === 0) process.exit(0);
const lint = spawnSync("npx", ["eslint", "--no-warn-ignored", ...files], { stdio: "inherit", shell });
process.exit(lint.status ?? 1);
