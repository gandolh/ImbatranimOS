import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { removeDependencies } from "./marketplace.service";

describe("removeDependencies", () => {
  let dir: string;
  let elsewhere: string;
  const file = (path: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "x");
  };

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "deps-")));
    elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "elsewhere-")));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it("removes the build's node_modules, at the root and in a workspace, and keeps the output whole", async () => {
    file(join(dir, "node_modules", "react", "index.js"));
    file(join(dir, "games", "node_modules", "vite", "index.js"));
    file(join(dir, "games", "dist", "os", "app.mjs"));
    file(join(dir, "games", "dist", "os", "node_modules", "kept.js"));
    file(join(dir, "games", "src", "app.tsx"));

    expect(await removeDependencies(dir, join(dir, "games", "dist", "os"))).toBe(2);
    expect(existsSync(join(dir, "node_modules"))).toBe(false);
    expect(existsSync(join(dir, "games", "node_modules"))).toBe(false);
    expect(existsSync(join(dir, "games", "dist", "os", "app.mjs"))).toBe(true);
    expect(existsSync(join(dir, "games", "dist", "os", "node_modules", "kept.js"))).toBe(true);
    expect(existsSync(join(dir, "games", "src", "app.tsx"))).toBe(true);
  });

  it("keeps a node_modules the output sits in", async () => {
    file(join(dir, "node_modules", "pkg", "dist", "app.mjs"));
    file(join(dir, "node_modules", "other", "index.js"));

    expect(await removeDependencies(dir, join(dir, "node_modules", "pkg", "dist"))).toBe(0);
    expect(existsSync(join(dir, "node_modules", "pkg", "dist", "app.mjs"))).toBe(true);
  });

  it("follows no symlink and leaves .git alone", async () => {
    file(join(elsewhere, "node_modules", "outside.js"));
    symlinkSync(elsewhere, join(dir, "linked"));
    file(join(dir, ".git", "node_modules", "inside-git"));
    file(join(dir, "dist", "app.mjs"));

    expect(await removeDependencies(dir, join(dir, "dist"))).toBe(0);
    expect(existsSync(join(elsewhere, "node_modules", "outside.js"))).toBe(true);
    expect(existsSync(join(dir, ".git", "node_modules", "inside-git"))).toBe(true);
  });
});
