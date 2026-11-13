import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { APPEARANCE_KEY, LOOKS, closeWindows, openDesktop, openFromStart, openStart, setLook } from "./desktop";

/**
 * Screenshots of the drawn screens in every look, for comparing with the
 * board's comps: `SHOTS_DIR=<folder> npm run e2e -w @imbatranim/core -- shots --workers=1`.
 * Named `<screen>-<look>-<width>.png`, the look being light, dark,
 * classic-light or classic-dark. It changes the dev account's appearance;
 * the teardown puts it back.
 */
const SHOTS_DIR = process.env.SHOTS_DIR;
test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  const info = test.info();
  test.skip(!SHOTS_DIR, "SHOTS_DIR names the folder");
  test.skip(info.project.name === "laptop-1366", "the board drew 1280 and the phones");
  test.skip(info.project.name === "phone-360" && /^the (undrawn|built-in)/.test(test.info().title), "once per width");
});

async function shoot(page: Page, name: string, width: number) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS_DIR ?? "", `${name}-${width}.png`) });
}

for (const [look, value] of Object.entries(LOOKS)) {
  test(`the drawn screens, ${look}`, async ({ page, request, browser }, info) => {
    const width = info.project.use.viewport?.width ?? 0;
    await setLook(request, value);

    // Sign-in: signed out, with the look the device kept for its first paint.
    const blob = JSON.stringify({
      state: { ...value, modePreference: value.mode, accents: { apricot: "apricot", classic: "crimson" } },
      version: 1,
    });
    const baseURL = info.project.use.baseURL ?? "";
    const signedOut = await browser.newContext({
      ...info.project.use,
      storageState: {
        cookies: [],
        origins: [{ origin: baseURL, localStorage: [{ name: APPEARANCE_KEY, value: blob }] }],
      },
    });
    const signIn = await signedOut.newPage();
    await signIn.goto("/");
    await expect(signIn.getByLabel("Password")).toBeVisible();
    await signIn.evaluate(() => document.fonts.ready.then(() => undefined));
    await shoot(signIn, `signin-${look}`, width);
    await signedOut.close();

    await openDesktop(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", value.mode);
    await shoot(page, `desktop-${look}`, width);

    await openStart(page);
    await shoot(page, `start-${look}`, width);
    await page.keyboard.press("Escape");

    await openFromStart(page, "Settings");
    await shoot(page, `settings-${look}`, width);
    await closeWindows(page);
  });
}

/**
 * The screens the board never drew, once per width in Apricot light: they take
 * the new tokens and the direction's patterns. Named `undrawn-<what>-<width>.png`.
 */
test("the undrawn screens, light", async ({ page, request }, info) => {
  const width = info.project.use.viewport?.width ?? 0;
  const phone = width < 600;
  await setLook(request, LOOKS.light);
  await openDesktop(page);
  const taskbar = page.getByTestId("taskbar");

  // The desktop's context menu, from an empty spot of the wallpaper.
  const box = page.viewportSize() ?? { width, height: 800 };
  await page.mouse.click(box.width - 30, box.height / 2, { button: "right" });
  await expect(page.getByRole("menu").last()).toBeVisible();
  await shoot(page, "undrawn-desktop-menu", width);
  await page.keyboard.press("Escape");

  // The tray: the volume, the notification panel and the clock's calendar.
  await taskbar
    .getByRole("button", { name: /^(Volume|Mute|Unmute|Sound)/ })
    .first()
    .click();
  await shoot(page, "undrawn-tray-volume", width);
  await page.keyboard.press("Escape");
  await taskbar.getByRole("button", { name: /^Notifications/ }).click();
  await shoot(page, "undrawn-notification-panel", width);
  await page.keyboard.press("Escape");
  await taskbar.getByRole("button", { name: /\d{2}:\d{2}/ }).click();
  await shoot(page, "undrawn-tray-calendar", width);
  await page.keyboard.press("Escape");

  // A toast, raised through the desktop's own notification store.
  await page.evaluate(async () => {
    const path = "/src/shared/store/notificationStore.ts";
    const store = (await import(/* @vite-ignore */ path)) as {
      notify: (n: { title: string; body: string; level: "info" }) => void;
    };
    store.notify({ title: "Screenshot check", body: "A toast for the redesign's screenshots.", level: "info" });
  });
  const toast = page.getByRole("status").filter({ hasText: "Screenshot check" });
  await expect(toast).toBeVisible();
  await shoot(page, "undrawn-toast", width);
  await toast.getByRole("button", { name: "Dismiss notification" }).click();

  // The command palette and the shortcuts overlay.
  await taskbar.getByRole("button", { name: "Search", exact: true }).click();
  await shoot(page, "undrawn-palette", width);
  await page.keyboard.press("Escape");
  if (!phone) {
    await page.keyboard.press("F1");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await shoot(page, "undrawn-shortcuts", width);
    await page.keyboard.press("Escape");
  }

  // A window's taskbar menu, and the window frame with an app in it.
  await openFromStart(page, "Calculator");
  await shoot(page, "undrawn-window", width);
  await taskbar.getByRole("button", { name: "Calculator" }).click({ button: "right" });
  await shoot(page, "undrawn-taskbar-menu", width);
  await page.keyboard.press("Escape");
  await closeWindows(page);

  // The cover screen, and back.
  const menu = await openStart(page);
  await menu.getByRole("menuitem", { name: "Cover screen" }).click();
  await expect(page.getByRole("button", { name: "Uncover" })).toBeVisible();
  await shoot(page, "undrawn-cover", width);
  await page.getByRole("button", { name: "Uncover" }).click();

  // Settings' other panels, a screen at a time.
  const settings = await openFromStart(page, "Settings");
  const scroller = settings.locator(".custom-scrollbar").first();
  for (let i = 1; i <= 6; i++) {
    await scroller.evaluate((el, n) => el.scrollTo({ top: n * el.clientHeight * 0.9 }), i);
    await shoot(page, `undrawn-settings-${i}`, width);
  }
  await closeWindows(page);
});

/** The 15 built-in apps take the tokens only: each opened once per width, nothing clicked inside. */
const BUILT_IN = [
  "Browser",
  "Calculator",
  "Calendar",
  "Clock",
  "Code Editor",
  "File Manager",
  "Image Viewer",
  "System Log",
  "Media Player",
  "Notepad",
  "Paint",
  "Terminal",
  "Snipping Tool",
  "Sticky Notes",
  "System Monitor",
];

test("the built-in apps, light", async ({ page, request }, info) => {
  test.setTimeout(240_000);
  const width = info.project.use.viewport?.width ?? 0;
  await setLook(request, LOOKS.light);
  await openDesktop(page);
  for (const name of BUILT_IN) {
    await openFromStart(page, name);
    await page.waitForTimeout(1200);
    await shoot(page, `app-${name.toLowerCase().replace(/ /g, "-")}`, width);
    await closeWindows(page);
  }
});
