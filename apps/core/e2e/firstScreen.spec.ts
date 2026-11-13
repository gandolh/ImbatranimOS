import { expect, test } from "@playwright/test";
import { openDesktop, openStart } from "./desktop";

/**
 * What Start shows without a scroll, at each size the board measured: A-Z rows
 * whole, pins, recent files, the foot band and the clock. The counts print
 * for the outcome note; the foot band and the clock must be in view.
 */
test("Start's first screen", async ({ page }, info) => {
  await openDesktop(page);
  const menu = await openStart(page);
  await page.waitForTimeout(300);
  const counts = await menu.evaluate((root) => {
    const view = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
    const bar = document.querySelector("[data-testid='taskbar']")?.getBoundingClientRect();
    /** Whole inside the viewport, above the taskbar, and inside every clipping box around it. */
    const whole = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.top < view.top - 0.5 || r.bottom > (bar?.top ?? view.bottom) + 0.5) return false;
      if (r.left < -0.5 || r.right > view.right + 0.5) return false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowY === "visible") continue;
        const c = a.getBoundingClientRect();
        if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) return false;
      }
      return true;
    };
    const count = (sel: string) => [...root.querySelectorAll(sel)].filter(whole).length;
    const clock = [...document.querySelectorAll("[data-testid='taskbar'] button")].find((b) =>
      /^\d{2}:\d{2}/.test(b.textContent ?? ""),
    );
    const named = (name: string) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
    const cover = named("Cover screen");
    const logOff = named("Log off");
    const clockBox = clock?.getBoundingClientRect();
    return {
      rows: count("[data-start-list]"),
      pins: count("[data-start-pinned]"),
      recent: count("[data-start-recent]"),
      footBand: Boolean(cover && logOff && whole(cover) && whole(logOff)),
      clock: Boolean(clockBox && clockBox.left >= 0 && clockBox.right <= window.innerWidth + 0.5),
    };
  });
  console.log(`first screen ${info.project.name}: ${JSON.stringify(counts)}`);
  expect(counts.footBand, "the foot band is whole").toBe(true);
  expect(counts.clock, "the clock is in view").toBe(true);
});
