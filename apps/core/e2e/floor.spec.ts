import { expect, test, type Locator } from "@playwright/test";
import {
  LOOKS,
  closeWindows,
  focusRing,
  openDesktop,
  openFromStart,
  openStart,
  outsideViewport,
  setLook,
  startButton,
  startMenu,
} from "./desktop";

/**
 * Hallmark's Floor checks that need a browser, against the dev container: the
 * focus ring, the reduced-motion path, the 13 px body on a 16 px root, and no
 * sideways scroll on a phone. They read the appearance the account has; the
 * shots spec sets each look itself.
 */

const isPhone = (name: string) => name.startsWith("phone");

/**
 * The look to check in (light, dark, classic-light or classic-dark): set
 * OS_E2E_LOOK, or leave it out to check the account's own appearance.
 */
const LOOK = process.env.OS_E2E_LOOK;
test.beforeEach(async ({ request }) => {
  if (!LOOK) return;
  const look = LOOKS[LOOK];
  if (!look) throw new Error(`OS_E2E_LOOK is one of ${Object.keys(LOOKS).join(", ")}`);
  await setLook(request, look);
});

test.describe("on a desktop", () => {
  test.beforeEach(() => {
    const info = test.info();
    test.skip(info.project.name !== "desktop-1280", "desktop checks run at 1280");
  });

  test("keeps the 13 px body on a 16 px root", async ({ page }) => {
    await openDesktop(page);
    const sizes = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).fontSize,
      body: getComputedStyle(document.body).fontSize,
    }));
    expect(sizes).toEqual({ root: "16px", body: "13px" });
  });

  test("draws a 2 px focus ring at 3:1 on Start, a taskbar button and a dialog button", async ({ page }) => {
    await openDesktop(page);

    // A taskbar button, reached with the keyboard.
    await startButton(page).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeFocused();
    const taskbar = await focusRing(page);
    expect(taskbar.width, "taskbar ring width").toBeGreaterThanOrEqual(2);
    expect(taskbar.contrast, `taskbar ring on ${taskbar.on}`).toBeGreaterThanOrEqual(3);

    // Start's first entry, reached with the keyboard from its search field.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(startMenu(page)).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const start = await focusRing(page);
    expect(start.width, "Start ring width").toBeGreaterThanOrEqual(2);
    expect(start.contrast, `Start ring on ${start.on}`).toBeGreaterThanOrEqual(3);
    await page.keyboard.press("Escape");
    await expect(startMenu(page)).toBeHidden();

    // A dialog's button: the shortcuts overlay's Close.
    await page.keyboard.press("F1");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    const close = await focusRing(page);
    expect(close.width, "dialog ring width").toBeGreaterThanOrEqual(2);
    expect(close.contrast, `dialog ring on ${close.on}`).toBeGreaterThanOrEqual(3);
    await page.keyboard.press("Escape");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test.beforeEach(() => {
    const info = test.info();
    test.skip(info.project.name !== "desktop-1280", "the motion checks run at 1280");
  });

  /**
   * Nothing animates, and the layer is already at rest the moment it appears:
   * framer-motion drives some values from script, which getAnimations() does
   * not list, so the opacity and transform are read too.
   */
  async function atRest(layer: Locator) {
    return layer.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        running: document.getAnimations().filter((a) => a.playState === "running").length,
        opacity: cs.opacity,
        transform: cs.transform,
      };
    });
  }
  const REST = { running: 0, opacity: "1", transform: "none" };

  test("opens Start, a window and a toast with nothing in motion", async ({ page }) => {
    await openDesktop(page);

    await startButton(page).click();
    expect(await atRest(startMenu(page)), "Start").toEqual(REST);
    await page.keyboard.press("Escape");

    const menu = await openStart(page);
    await menu.getByRole("searchbox", { name: "Search apps and files" }).fill("Calculator");
    await expect(menu.getByRole("menuitem", { name: /^Calculator/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    expect(await atRest(page.locator("[data-window-id][data-app-id='calculator']")), "the window").toEqual(REST);
    await closeWindows(page);

    // A toast, raised through the desktop's own notification store (the dev
    // server serves its modules by path), then dismissed.
    await page.evaluate(async () => {
      const path = "/src/shared/store/notificationStore.ts";
      const store = (await import(/* @vite-ignore */ path)) as {
        notify: (n: { title: string; level: "info" }) => void;
      };
      store.notify({ title: "Reduced motion check", level: "info" });
    });
    const toast = page.getByRole("status").filter({ hasText: "Reduced motion check" });
    expect(await atRest(toast), "the toast").toEqual(REST);
    await toast.getByRole("button", { name: "Dismiss notification" }).click();
  });
});

test.describe("on a phone", () => {
  test.beforeEach(() => {
    const info = test.info();
    test.skip(!isPhone(info.project.name), "the phone checks run at 390 and 360");
  });

  test("is a coarse pointer", async ({ page }) => {
    await openDesktop(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  });

  test("never scrolls sideways: sign-in, the desktop, Start and Settings", async ({ browser, page }, info) => {
    const width = info.project.use.viewport?.width ?? 0;
    const signedOut = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const signIn = await signedOut.newPage();
    await signIn.goto("/");
    await expect(signIn.getByLabel("Password")).toBeVisible();
    expect(await signIn.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await outsideViewport(signIn, "form, form *")).toEqual([]);
    await signedOut.close();

    await openDesktop(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await outsideViewport(page, "[data-testid='taskbar'] > *, [data-testid='taskbar'] button")).toEqual([]);
    // Every desktop icon is reachable: none is drawn under the taskbar, and
    // one past the desktop's edge sits in a part that scrolls, not one that
    // cuts it off.
    const unreachable = await page.evaluate(() => {
      const bar = document.querySelector("[data-testid='taskbar']")?.getBoundingClientRect();
      if (!bar) return ["no taskbar"];
      const icons = [...document.querySelectorAll<HTMLElement>("[role='button'][aria-pressed][tabindex='0']")];
      return icons.flatMap((icon) => {
        const r = icon.getBoundingClientRect();
        let clip: HTMLElement | null = icon.parentElement;
        while (clip && getComputedStyle(clip).overflow === "visible") clip = clip.parentElement;
        const c = (clip ?? document.documentElement).getBoundingClientRect();
        const cs = clip ? getComputedStyle(clip) : null;
        const name = icon.getAttribute("aria-label") ?? "";
        const bottom = Math.min(r.bottom, c.bottom);
        const out: string[] = [];
        if (r.top < c.bottom && bottom > bar.top + 0.5) out.push(`${name}: under the taskbar`);
        if (r.right > c.right + 0.5 && !/auto|scroll/.test(cs?.overflowX ?? ""))
          out.push(`${name}: cut off at the side`);
        if (r.bottom > c.bottom + 0.5 && !/auto|scroll/.test(cs?.overflowY ?? "")) out.push(`${name}: cut off below`);
        return out;
      });
    });
    expect(unreachable, "desktop icons out of reach").toEqual([]);

    const menu = await openStart(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await outsideViewport(page, "[role='menu'][aria-label='Start menu'] *")).toEqual([]);
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");

    await openFromStart(page, "Settings");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await outsideViewport(page, "[data-window-id], [data-window-id] button")).toEqual([]);
    await closeWindows(page);
  });
});
