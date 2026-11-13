import { expect, test } from "@playwright/test";
import { LOOKS, closeWindows, openDesktop, openFromStart, setLook } from "./desktop";

/**
 * The Light / Dark / System switch in Settings → Appearance, in both themes.
 * It saves the choice for the dev account, so the steps run in order, and the
 * global teardown puts the account's appearance back.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  const info = test.info();
  test.skip(info.project.name !== "desktop-1280", "the switch is checked once, at 1280");
});

for (const theme of ["apricot", "classic"] as const) {
  test(`switches Light, Dark and System in ${theme}`, async ({ page, request }) => {
    await setLook(request, theme === "apricot" ? LOOKS.light : LOOKS["classic-light"]);
    await openDesktop(page);
    const win = await openFromStart(page, "Settings");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-os-theme", theme);

    await win.getByRole("radio", { name: "Dark" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await win.getByRole("radio", { name: "Light" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.emulateMedia({ colorScheme: "dark" });
    await win.getByRole("radio", { name: "System" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");

    await win.getByRole("radio", { name: "Light" }).click();
    await closeWindows(page);
  });
}
