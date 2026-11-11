import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { loadCatalog } from "./catalog";
import { isVerified, loadVerified, parseVerified, verifiedEntry } from "./verified";

const PIN = "c".repeat(40);
const A = "a".repeat(40);
const B = "b".repeat(40);
const options = { allowLocalRepos: false };

const file = (apps: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ from: "imbatranim-apps", commit: PIN, apps, ...extra });

describe("the verified list", () => {
  it("reads entries with the repository normalized as a URL check does", () => {
    const list = parseVerified(
      file([
        {
          repo: "https://github.com/Someone/Notes.git",
          commit: A,
          note: "Notes, reviewed",
        },
        {
          repo: "https://github.com/someone/desk",
          subdir: "apps/tasks/",
          commit: B,
        },
      ]),
      options,
    );
    expect(list).toEqual({
      commit: PIN,
      problem: null,
      apps: [
        {
          repo: "https://github.com/someone/notes",
          subdir: null,
          commit: A,
          note: "Notes, reviewed",
        },
        {
          repo: "https://github.com/someone/desk",
          subdir: "apps/tasks",
          commit: B,
          note: "",
        },
      ],
    });
  });

  it("verifies an app only at the commit its entry names, and only in that folder", () => {
    const list = parseVerified(
      file([
        {
          repo: "https://github.com/someone/desk",
          subdir: "apps/tasks",
          commit: B,
        },
      ]),
      options,
    );
    const repo = "https://github.com/someone/desk";
    expect(isVerified(list, { repo, subdir: "apps/tasks", commit: B })).toBe(true);
    expect(isVerified(list, { repo, subdir: "apps/tasks", commit: A })).toBe(false);
    expect(isVerified(list, { repo, subdir: null, commit: B })).toBe(false);
    expect(isVerified(list, { repo, subdir: "apps", commit: B })).toBe(false);
    expect(verifiedEntry(list, repo, "apps/tasks")?.commit).toBe(B);
    expect(verifiedEntry(list, repo, null)).toBeNull();
  });

  it.each([
    ["not JSON", "{"],
    ["another source", file([], { from: "someone-else" })],
    ["a short pin", file([], { commit: "abc" })],
    ["a short commit", file([{ repo: "https://github.com/a/b", commit: "abc" }])],
    ["an unknown key", file([{ repo: "https://github.com/a/b", commit: A, extra: 1 }])],
    ["a host other than github.com", file([{ repo: "https://example.com/a/b", commit: A }])],
    ["a branch URL", file([{ repo: "https://github.com/a/b/tree/main", commit: A }])],
    ["a folder that climbs", file([{ repo: "https://github.com/a/b", subdir: "../c", commit: A }])],
    [
      "an app listed twice",
      file([
        { repo: "https://github.com/a/b", commit: A },
        { repo: "https://github.com/A/b.git", commit: B },
      ]),
    ],
  ])("verifies nothing when the file has %s, and says why", (_, text) => {
    const list = parseVerified(text, options);
    expect(list.apps).toEqual([]);
    expect(list.commit).toBeNull();
    expect(list.problem).toEqual(expect.any(String));
  });

  it("takes file:// repositories only when local repos are allowed", () => {
    const text = file([{ repo: "file:///tmp/repo", commit: A }]);
    expect(parseVerified(text, options).problem).not.toBeNull();
    expect(parseVerified(text, { allowLocalRepos: true }).apps[0].repo).toBe("file:///tmp/repo");
  });

  describe("beside the catalog", () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "imb-verified-"));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it("is an empty list, not a problem, when the file is missing", () => {
      expect(loadVerified(dir, options)).toEqual({
        commit: null,
        apps: [],
        problem: null,
      });
    });

    it("is read from the catalog directory and is never read as a descriptor", () => {
      writeFileSync(join(dir, "verified.json"), file([{ repo: "https://github.com/a/b", commit: A }]));
      expect(loadVerified(dir, options).apps).toHaveLength(1);
      expect(loadCatalog(dir, options)).toEqual({
        descriptors: new Map(),
        problems: [],
      });
    });
  });
});
