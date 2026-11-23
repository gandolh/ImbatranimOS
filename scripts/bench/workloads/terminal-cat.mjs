// The Terminal path end to end: `cat` of the 50 MB plain input in a desktop Terminal window (PTY, socket,
// xterm in headless Chromium), timed from the first socket message after the command to the frame that
// shows the end marker. Needs a running desktop and a signed-in session:
//
//   BENCH_URL=http://localhost:5173 BENCH_STATE=<storage-state.json> \
//     node scripts/bench/run.mjs scripts/bench/workloads/terminal-cat.mjs
//
// BENCH_STATE is a Playwright storage state saved after signing in; BENCH_FILE overrides the input (a path
// the desktop's shell can read, default the plain input in the bench folder).
/* global window, document -- the functions handed to page.evaluate run in the browser */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchDir } from "../lib.mjs";
import { INPUTS } from "../generate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// Playwright comes from the desktop workspace, which owns the end-to-end tests.
const { chromium } = createRequire(path.join(root, "apps/core/package.json"))("@playwright/test");

export const name = "terminal-cat-50mb";

let browser;
let page;
let n = 0;

export async function setup() {
  const url = process.env.BENCH_URL ?? "http://localhost:5173";
  const storageState = process.env.BENCH_STATE;
  if (!storageState) throw new Error("BENCH_STATE: a Playwright storage state of a signed-in session");
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState });
  // Timestamps every socket message once a run is armed; the page's clock, so first byte and last frame
  // are read on one timeline.
  await context.addInitScript(() => {
    const Original = window.WebSocket;
    window.__bench = { armed: false, first: null };
    window.WebSocket = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", () => {
          if (window.__bench.armed && window.__bench.first === null) window.__bench.first = performance.now();
        });
      }
    };
  });
  page = await context.newPage();
  await page.goto(url);
  await page.getByText("Terminal", { exact: true }).first().dblclick();
  await page.locator(".xterm").first().waitFor();
  await page.waitForTimeout(1500);
  await page.locator(".xterm").first().click();
}

export async function run() {
  n += 1;
  const file = process.env.BENCH_FILE ?? path.join(benchDir(), INPUTS.plain.file);
  const marker = `__BENCH_DONE_${n}__`;
  await page.evaluate(() => {
    window.__bench.armed = true;
    window.__bench.first = null;
  });
  // The marker is printed in two parts, so the typed command line never matches it.
  await page.keyboard.type(`cat ${file}; printf '__BENCH_%s_%s__\\n' DONE ${n}`);
  await page.keyboard.press("Enter");
  const last = await page.waitForFunction(
    (m) => {
      const rows = document.querySelectorAll(".xterm-rows > div");
      for (const row of rows) if (row.textContent.replace(/\s+/g, " ").trim() === m) return performance.now();
      return false;
    },
    marker,
    { polling: "raf", timeout: 600_000 },
  );
  const end = await last.jsonValue();
  const first = await page.evaluate(() => {
    window.__bench.armed = false;
    return window.__bench.first;
  });
  await page.keyboard.type("clear");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  return end - first;
}

export async function teardown() {
  await browser?.close();
}
