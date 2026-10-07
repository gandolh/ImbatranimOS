#!/usr/bin/env node
// Every commit bumps the minor version: 1.0.0 -> 1.1.0 -> 1.2.0. The owner's
// rule since v1.0.0 (2026-10-07, corpus/wiki/decisions.md). Run it before each
// commit: `npm run version:bump -- --stage` bumps and stages the files.
//
// The new version is computed from HEAD's package.json, not the working copy,
// so running it twice before one commit bumps once, not twice. Don't run it
// before `git commit --amend`: HEAD already carries the bump.
//
// The product version lives in four places, all rewritten here:
//   package.json, package-lock.json (two fields), and the Dockerfile's image
//   label and IMAGE_VERSION, which the About panel shows.
// Workspace and add-on package.json versions are per-package and stay as they are.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv.includes('--stage');

function headVersion() {
  try {
    const pkg = execFileSync('git', ['show', 'HEAD:package.json'], { cwd: root, encoding: 'utf8' });
    return JSON.parse(pkg).version;
  } catch {
    // No HEAD yet (first commit): start from the working copy.
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  }
}

const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(headVersion());
if (!match) {
  console.error(`bump-version: HEAD's version is not x.y.z: ${headVersion()}`);
  process.exit(1);
}
const next = `${match[1]}.${Number(match[2]) + 1}.0`;

function rewrite(file, edit) {
  const full = path.join(root, file);
  const before = readFileSync(full, 'utf8');
  const after = edit(before);
  if (after === before) {
    console.error(`bump-version: nothing to change in ${file}`);
    process.exit(1);
  }
  writeFileSync(full, after);
}

const setJsonVersion = (text, replacer) => {
  const data = JSON.parse(text);
  replacer(data);
  return `${JSON.stringify(data, null, 2)}\n`;
};

rewrite('package.json', (t) => setJsonVersion(t, (d) => { d.version = next; }));
rewrite('package-lock.json', (t) =>
  setJsonVersion(t, (d) => {
    d.version = next;
    d.packages[''].version = next;
  }),
);
rewrite('infrastructure/Dockerfile', (t) =>
  t
    .replace(/(org\.opencontainers\.image\.version=")[^"]*(")/, `$1${next}$2`)
    .replace(/(IMAGE_VERSION=)\S+/, `$1${next}`),
);

if (stage) {
  execFileSync('git', ['add', 'package.json', 'package-lock.json', 'infrastructure/Dockerfile'], {
    cwd: root,
  });
}
console.log(`version ${next}`);
