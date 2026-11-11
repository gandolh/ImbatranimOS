#!/usr/bin/env node
// The dependency manifests with the product version taken out.
//
// Every commit bumps the version (scripts/bump-version.mjs), which rewrites
// package.json, two fields of package-lock.json and two lines of the
// Dockerfile. None of that changes a dependency, yet each of those files was a
// cache key or a watch trigger, so every commit reinstalled node_modules in
// the image and rebuilt the dev container. The normalised copies differ only
// when something other than the version does:
//
//   - the image's `manifests` stage runs this on its copies of package.json
//     and package-lock.json, and the `npm ci` layer copies the result;
//   - `npm run dev` (scripts/dev.mjs) writes normalised copies of the two and
//     of the Dockerfile to infrastructure/.dev-deps/, which Compose watches.
//
// CLI: `node normalise-manifests.mjs <dir>` rewrites <dir>/package.json and
// <dir>/package-lock.json in place.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** What the version reads as in a normalised file. npm accepts it like any other. */
export const NORMAL_VERSION = "0.0.0";

const json = (data) => `${JSON.stringify(data, null, 2)}\n`;

/** package.json without its version. */
export function normalisePackageJson(text) {
  const data = JSON.parse(text);
  if ("version" in data) data.version = NORMAL_VERSION;
  return json(data);
}

/** package-lock.json without the root package's version (both places it sits). */
export function normaliseLockfile(text) {
  const data = JSON.parse(text);
  if ("version" in data) data.version = NORMAL_VERSION;
  if (data.packages?.[""]?.version !== undefined) data.packages[""].version = NORMAL_VERSION;
  return json(data);
}

/** The Dockerfile without the image label's version and IMAGE_VERSION. */
export function normaliseDockerfile(text) {
  return text
    .replace(/(org\.opencontainers\.image\.version=")[^"]*(")/g, `$1${NORMAL_VERSION}$2`)
    .replace(/(IMAGE_VERSION=)\S+/g, `$1${NORMAL_VERSION}`);
}

function main(dir) {
  for (const [file, normalise] of [
    ["package.json", normalisePackageJson],
    ["package-lock.json", normaliseLockfile],
  ]) {
    const full = path.join(dir, file);
    writeFileSync(full, normalise(readFileSync(full, "utf8")));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: normalise-manifests.mjs <dir>");
    process.exit(2);
  }
  main(dir);
}
