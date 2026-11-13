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
