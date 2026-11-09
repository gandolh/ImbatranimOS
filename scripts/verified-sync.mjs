#!/usr/bin/env node
// npm run verified:sync -- <apps-checkout> [<commit>] [--check]
//
// Copies imbatranim-apps' verified.json at <commit> into marketplace/verified.json,
// recording the commit, which is the pin: the OS reads only this copy, and the
// image carries it, so what counts as verified changes only with an OS release.
// It reads git objects (`git show <commit>:verified.json`), never the checkout's
// working tree. <commit> is any name git resolves there (a hash, a tag, main).
//
// --check writes nothing and exits 1 when marketplace/verified.json is not
// exactly what <commit> holds, or, with no <commit>, what the commit it records
// holds. The backend validates the entries when it reads the copy; the apps
// repository's own test checks them before they get here.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET = path.join(root, 'marketplace', 'verified.json');
const FROM = 'imbatranim-apps';

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** The copy's text for `commit` of the apps checkout: what sync writes. */
export function render(appsDir, commit) {
  let sha;
  try {
    sha = git(appsDir, 'rev-parse', '--verify', `${commit}^{commit}`).trim();
  } catch {
    throw new Error(`${commit} is not a commit of ${appsDir}`);
  }
  let text;
  try {
    text = git(appsDir, 'show', `${sha}:verified.json`);
  } catch {
    throw new Error(`there is no verified.json at ${sha}`);
  }
  let file;
  try {
    file = JSON.parse(text);
  } catch (err) {
    throw new Error(`verified.json at ${sha} is not JSON: ${err.message}`);
  }
  if (!file || typeof file !== 'object' || !Array.isArray(file.apps)) {
    throw new Error(`verified.json at ${sha} has no apps list`);
  }
  return {
    sha,
    text: `${JSON.stringify({ from: FROM, commit: sha, apps: file.apps }, null, 2)}\n`,
  };
}

/** The commit the copy at `target` records, or null when there is none. */
export function recordedCommit(target = TARGET) {
  try {
    const commit = JSON.parse(readFileSync(target, 'utf8')).commit;
    return typeof commit === 'string' ? commit : null;
  } catch {
    return null;
  }
}

/**
 * Sync, or with `check` compare. Answers `{ sha, changed }`: `changed` says
 * the copy differed (and, without `check`, was written).
 */
export function syncVerified({ appsDir, commit, check = false, target = TARGET }) {
  const wanted = commit ?? recordedCommit(target);
  if (!wanted) throw new Error(`${path.basename(target)} records no commit: name one`);
  const { sha, text } = render(appsDir, wanted);
  let current = null;
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing: out of date, or written now.
  }
  const changed = current !== text;
  if (changed && !check) writeFileSync(target, text);
  return { sha, changed };
}

function main(argv) {
  const check = argv.includes('--check');
  const positional = argv.filter((a) => a !== '--check');
  if (positional.length < 1 || positional.length > 2 || (!check && positional.length !== 2)) {
    console.error('usage: npm run verified:sync -- <apps-checkout> <commit> [--check]');
    console.error('       npm run verified:sync -- <apps-checkout> --check');
    return 2;
  }
  const [appsDir, commit] = positional;
  try {
    const { sha, changed } = syncVerified({
      appsDir: path.resolve(appsDir),
      commit,
      check,
    });
    if (check) {
      if (changed) {
        console.log(
          `verified:sync --check: marketplace/verified.json is not imbatranim-apps' verified.json at ${sha}. Run the sync.`,
        );
        return 1;
      }
      console.log(`verified:sync --check: marketplace/verified.json is ${sha}'s, byte for byte.`);
    } else {
      console.log(
        changed
          ? `verified:sync: wrote marketplace/verified.json from ${sha}.`
          : `verified:sync: marketplace/verified.json was already ${sha}'s.`,
      );
    }
    return 0;
  } catch (err) {
    console.error(`verified:sync: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
