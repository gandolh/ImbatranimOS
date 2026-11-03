#!/usr/bin/env node
// `npm run dev`: the dev container under `docker compose watch`, rebuilt when
// a dependency or the image changes, and not when only the version does.
//
// Compose's `rebuild` action fires on any change to the files it watches, and
// every commit bumps the version in package.json, package-lock.json and the
// Dockerfile, so watching those restarted the container on each commit. This
// keeps normalised copies of the three (version taken out, see
// normalise-manifests.mjs) in infrastructure/.dev-deps/, rewrites a copy only
// when its content changes, and Compose watches the copies instead.
//
// Arguments are passed on to `docker compose watch`.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, unwatchFile, watchFile, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normaliseDockerfile,
  normaliseLockfile,
  normalisePackageJson,
} from './normalise-manifests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'infrastructure', '.dev-deps');

const COPIES = [
  { from: 'package.json', to: 'package.json', normalise: normalisePackageJson },
  { from: 'package-lock.json', to: 'package-lock.json', normalise: normaliseLockfile },
  { from: 'infrastructure/Dockerfile', to: 'Dockerfile', normalise: normaliseDockerfile },
];

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Write each normalised copy whose content changed. */
function refresh() {
  for (const { from, to, normalise } of COPIES) {
    const source = read(path.join(root, from));
    if (source === null) continue;
    let next;
    try {
      next = normalise(source);
    } catch {
      // npm is halfway through writing the file; the next poll sees it whole.
      continue;
    }
    const target = path.join(out, to);
    if (read(target) !== next) writeFileSync(target, next);
  }
}

mkdirSync(out, { recursive: true });
refresh();
// Polling, not fs.watch: npm and editors replace these files by renaming a new
// one over them, which an fs.watch on the old file never reports.
for (const { from } of COPIES) watchFile(path.join(root, from), { interval: 1000 }, refresh);

const compose = spawn(
  'docker',
  [
    'compose',
    '-f',
    'infrastructure/docker-compose.yml',
    '--profile',
    'dev',
    'watch',
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: 'inherit' },
);

// Ctrl+C reaches Compose from the terminal by itself; a second one from here
// would make it force-stop. Stay alive until it has shut down.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => compose.kill('SIGTERM'));
compose.on('exit', (code, signal) => {
  for (const { from } of COPIES) unwatchFile(path.join(root, from));
  process.exit(code ?? (signal ? 1 : 0));
});
compose.on('error', (err) => {
  console.error(`dev: could not start docker compose: ${err.message}`);
  process.exit(1);
});
