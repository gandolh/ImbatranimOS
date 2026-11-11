// node --test scripts/verified-sync.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { syncVerified } from "./verified-sync.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "verified-sync.mjs");
const A = "a".repeat(40);

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  }).trim();
}

describe("verified:sync", () => {
  let work;
  let apps;
  let target;
  let first;
  let second;

  before(() => {
    work = mkdtempSync(path.join(tmpdir(), "imb-verified-sync-"));
    apps = path.join(work, "apps");
    target = path.join(work, "verified.json");
    git(work, "init", "-q", "-b", "main", apps);
    writeFileSync(path.join(apps, "verified.json"), '{ "apps": [] }\n');
    git(apps, "add", ".");
    git(apps, "commit", "-qm", "empty");
    first = git(apps, "rev-parse", "HEAD");
    writeFileSync(
      path.join(apps, "verified.json"),
      JSON.stringify({
        apps: [{ repo: "https://github.com/a/b", commit: A, note: "b" }],
      }),
    );
    git(apps, "commit", "-qam", "one app");
    second = git(apps, "rev-parse", "HEAD");
    // The working tree is never read: an uncommitted edit changes nothing.
    writeFileSync(path.join(apps, "verified.json"), '{ "apps": "not committed" }');
  });

  after(() => rmSync(work, { recursive: true, force: true }));

  it("copies the list at a commit, recording the full commit", () => {
    assert.deepEqual(syncVerified({ appsDir: apps, commit: first.slice(0, 8), target }), {
      sha: first,
      changed: true,
    });
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), {
      from: "imbatranim-apps",
      commit: first,
      apps: [],
    });
    assert.equal(syncVerified({ appsDir: apps, commit: first, target }).changed, false);
  });

  it("checks the copy against the commit it records, and passes when it matches", () => {
    assert.equal(syncVerified({ appsDir: apps, check: true, target }).changed, false);
  });

  it("fails the check when the copy is out of date with a newer commit, and writes nothing", () => {
    const before = readFileSync(target, "utf8");
    assert.equal(syncVerified({ appsDir: apps, commit: "main", check: true, target }).changed, true);
    assert.equal(readFileSync(target, "utf8"), before);
  });

  it("fails the check when the copy was edited by hand", () => {
    const copy = JSON.parse(readFileSync(target, "utf8"));
    copy.apps.push({ repo: "https://github.com/c/d", commit: A });
    writeFileSync(target, JSON.stringify(copy, null, 2) + "\n");
    assert.equal(syncVerified({ appsDir: apps, check: true, target }).changed, true);
    syncVerified({ appsDir: apps, commit: second, target });
    assert.equal(JSON.parse(readFileSync(target, "utf8")).apps.length, 1);
  });

  it("refuses a name that is no commit there", () => {
    assert.throws(() => syncVerified({ appsDir: apps, commit: "nope", target }), /not a commit/);
  });

  it("exits 1 from the command line when the check fails, 2 on a usage mistake", () => {
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(run().status, 2);
    assert.equal(run(apps).status, 2);
    // The repository's own copy against a commit of this throwaway repo.
    assert.equal(run(apps, first, "--check").status, 1);
  });
});
