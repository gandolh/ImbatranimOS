import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Browser checks against the dev container (`infrastructure-dev-1`), never a
 * desktop run on the host: the container shows the desktop on port 5173 with
 * its own home volume, so no real file is touched (the owner's rule,
 * 2026-11-13). Run by hand with `npm run e2e -w @imbatranim/core`, at most two
 * workers; `npm run check` never runs them.
 *
 * The dev account's password comes from `OS_E2E_PASSWORD` on the command line
 * (infrastructure/README.md names it). The session, the results and the saved
 * appearance live in the system's temp folder, outside the repo.
 */
export const E2E_DIR = join(tmpdir(), "imbatranimos-e2e");
export const STATE_FILE = join(E2E_DIR, "session.json");

const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

export default defineConfig({
  testDir: "./e2e",
  outputDir: join(E2E_DIR, "results"),
  globalSetup: "./e2e/globalSetup.ts",
  globalTeardown: "./e2e/globalTeardown.ts",
  workers: 2,
  // The specs that change the appearance run in order inside their file; one
  // dev account backs every worker.
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.OS_E2E_URL ?? "http://localhost:5173",
    storageState: STATE_FILE,
    // A trace records what was typed, the password included.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "laptop-1366", use: { viewport: { width: 1366, height: 768 } } },
    { name: "phone-390", use: { viewport: { width: 390, height: 844 }, ...phone } },
    { name: "phone-360", use: { viewport: { width: 360, height: 800 }, ...phone } },
  ],
});
