import { parseNativeManifest } from "./native-manifest";
import { deriveAppId } from "./source-url";

const SHA = "b".repeat(40);
const REPO = "https://github.com/someone/notes-app";
const source = { repo: REPO, commit: SHA, subdir: null };
const options = { allowLocalRepos: false };
const derived = deriveAppId(REPO, null);

function single(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    name: "Notes",
    type: "static",
    build: {
      install: ["npm", "ci"],
      command: ["npm", "run", "build"],
      entry: "dist/notes.mjs",
    },
    capabilities: ["fs", "notify"],
    minSystemVersion: 2,
    ...extra,
  };
}

function suite(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    name: "Desk",
    type: "service",
    build: { command: ["npm", "run", "build"], output: "dist" },
    server: { command: ["node", "server.js"], portEnv: "PORT" },
    sharedKit: 3,
    apps: [
      {
        id: "notes",
        name: "Notes",
        entry: "notes/app.mjs",
        styles: ["notes/app.css"],
        opens: ["md"],
        capabilities: ["fs"],
        background: true,
      },
      { id: "tasks", name: "Tasks", entry: "tasks/app.mjs", capabilities: [] },
    ],
    minSystemVersion: 2,
    ...extra,
  };
}

describe("imbatranim.json version 2 (built from source)", () => {
  it("reads one app as the catalog does, with the derived id and the resolved source", () => {
    const r = parseNativeManifest(single(), source, options);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.descriptor).toMatchObject({
      schemaVersion: 1,
      id: derived,
      name: "Notes",
      type: "static",
      runtime: "native",
      source: { repo: REPO, ref: SHA },
      build: { output: "dist", command: ["npm", "run", "build"] },
    });
    expect(r.descriptor.apps).toHaveLength(1);
    expect(r.descriptor.apps[0]).toMatchObject({
      id: derived,
      entry: "notes.mjs",
      capabilities: ["fs", "notify"],
      icon: "package",
    });
  });

  it("keeps the folder the URL names in the source", () => {
    const r = parseNativeManifest(single(), { ...source, subdir: "apps/notes" }, options);
    expect(r.ok && r.descriptor.source).toEqual({
      repo: REPO,
      ref: SHA,
      subdir: "apps/notes",
    });
    expect(r.ok && r.descriptor.id).toBe(deriveAppId(REPO, "apps/notes"));
  });

  it("reads several apps, a server and kit hooks, each app id under the derived one", () => {
    const r = parseNativeManifest(suite(), source, options);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.descriptor.schemaVersion).toBe(2);
    expect(r.descriptor.id).toBe(derived);
    expect(r.descriptor.server?.portEnv).toBe("PORT");
    expect(r.descriptor.sharedKit).toBe(3);
    expect(r.descriptor.apps.map((a) => a.id)).toEqual([`${derived}-notes`, `${derived}-tasks`]);
    expect(r.descriptor.apps[0]).toMatchObject({
      opens: ["md"],
      background: true,
      styles: ["notes/app.css"],
    });
  });

  it.each(["id", "source", "runtime"])("refuses a %s: the OS derives it", (key) => {
    const r = parseNativeManifest(single({ [key]: "x" }), source, options);
    expect(r).toEqual({
      ok: false,
      problem: `imbatranim.json: ${key}: an app from a URL does not set its ${key}: the OS derives it`,
    });
  });

  it("refuses another schemaVersion", () => {
    const r = parseNativeManifest(single({ schemaVersion: 1 }), source, options);
    expect(r.ok).toBe(false);
  });

  it("validates with the catalog's schema: an unknown capability, a shell string, an unknown key", () => {
    for (const bad of [
      single({ capabilities: ["root"] }),
      single({ build: { command: "npm run build", entry: "dist/a.mjs" } }),
      single({ homepage: "https://example.com" }),
      single({ type: "service" }),
      suite({ sharedKit: undefined }),
    ]) {
      const r = parseNativeManifest(bad, source, options);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toMatch(/^imbatranim\.json: /);
    }
  });

  it("refuses an app id that would make the derived one too long", () => {
    const long = suite();
    long.apps[1].id = "a".repeat(26);
    const r = parseNativeManifest(long, source, options);
    expect(r).toEqual({
      ok: false,
      problem: "imbatranim.json: apps.1.id: at most 25 characters in an app from a URL",
    });
    long.apps[1].id = "a".repeat(25);
    expect(parseNativeManifest(long, source, options).ok).toBe(true);
  });

  it("refuses an x- app id, as the catalog does", () => {
    const bad = suite();
    bad.apps[0].id = "x-notes";
    expect(parseNativeManifest(bad, source, options).ok).toBe(false);
  });

  it("takes a file:// repository only when local repos are allowed", () => {
    const local = { repo: "file:///tmp/repo", commit: SHA, subdir: null };
    expect(parseNativeManifest(single(), local, options).ok).toBe(false);
    expect(parseNativeManifest(single(), local, { allowLocalRepos: true }).ok).toBe(true);
  });
});
