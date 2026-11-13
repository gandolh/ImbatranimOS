import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/** The appearance dotfile's key (appearanceStore.ts). */
export const APPEARANCE_KEY = "imbatranimos:appearance";

export type Look = { theme: "apricot" | "classic"; mode: "light" | "dark" };

export const LOOKS: Record<string, Look> = {
  light: { theme: "apricot", mode: "light" },
  dark: { theme: "apricot", mode: "dark" },
  "classic-light": { theme: "classic", mode: "light" },
  "classic-dark": { theme: "classic", mode: "dark" },
};

/**
 * Saves a theme and mode for the dev account, with the default accents, the
 * way the store writes them. Load the page after it: the desktop reads the
 * dotfile when it starts.
 */
export async function setLook(api: APIRequestContext, look: Look): Promise<void> {
  const state = {
    theme: look.theme,
    mode: look.mode,
    modePreference: look.mode,
    accents: { apricot: "apricot", classic: "crimson" },
  };
  const res = await api.put("/api/prefs", {
    data: { entries: [{ key: APPEARANCE_KEY, value: JSON.stringify({ state, version: 1 }) }] },
  });
  expect(res.ok(), "the appearance was saved").toBe(true);
}

/** The desktop, signed in, with the taskbar drawn and the fonts loaded. */
export async function openDesktop(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("taskbar")).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export function startButton(page: Page): Locator {
  return page.getByRole("button", { name: "Start", exact: true });
}

export function startMenu(page: Page): Locator {
  return page.getByRole("menu", { name: "Start menu" });
}

export async function openStart(page: Page): Promise<Locator> {
  await startButton(page).click();
  const menu = startMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

/** Opens an app through Start's search, the way a person would. */
export async function openFromStart(page: Page, name: string): Promise<Locator> {
  const menu = await openStart(page);
  await menu.getByRole("searchbox", { name: "Search apps and files" }).fill(name);
  await expect(menu.getByRole("menuitem", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const win = page.locator(`[data-window-id]`).filter({ hasText: name }).last();
  await expect(win).toBeVisible();
  return win;
}

export async function closeWindows(page: Page): Promise<void> {
  for (const close of await page.locator("[data-window-id] button[title='Close']").all()) {
    if (await close.isVisible()) await close.click();
  }
}

/**
 * The focus ring of the focused element: its width, and its contrast against
 * the surface it is drawn on. A Tailwind ring is a box-shadow with a spread
 * and no blur; an outline counts too.
 */
export async function focusRing(page: Page): Promise<{ width: number; contrast: number; on: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) throw new Error("nothing has focus");
    const cs = getComputedStyle(el);
    const parse = (c: string): [number, number, number, number] => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return [0, 0, 0, 0];
      const p = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    let ring: { width: number; color: string; inset: boolean } | null = null;
    for (const shadow of cs.boxShadow.split(/,(?![^(]*\))/)) {
      const color = /rgba?\([^)]+\)/.exec(shadow)?.[0];
      const px = [...shadow.replace(/rgba?\([^)]+\)/, "").matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
      if (color && px.length >= 4 && px[2] === 0 && px[3] > 0 && parse(color)[3] > 0) {
        if (!ring || px[3] > ring.width) ring = { width: px[3], color, inset: shadow.includes("inset") };
      }
    }
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > (ring?.width ?? 0)) {
      ring = { width: parseFloat(cs.outlineWidth), color: cs.outlineColor, inset: parseFloat(cs.outlineOffset) < 0 };
    }
    if (!ring) return { width: 0, contrast: 0, on: "" };
    // The surface the ring is drawn on: the element's own fill for an inset
    // ring, else what is behind it. Translucent fills are blended down.
    const layers: [number, number, number, number][] = [];
    for (let n: HTMLElement | null = ring.inset ? el : el.parentElement; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 1) break;
    }
    let surface: [number, number, number] = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) {
      surface = [r * a + surface[0] * (1 - a), g * a + surface[1] * (1 - a), b * a + surface[2] * (1 - a)];
    }
    const lum = ([r, g, b]: number[]) => {
      const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [hi, lo] = [lum(parse(ring.color)), lum(surface)].sort((x, y) => y - x);
    return { width: ring.width, contrast: (hi + 0.05) / (lo + 0.05), on: `rgb(${surface.map(Math.round).join(", ")})` };
  });
}

/** Every box of `selector` that leaves the viewport sideways, by its text. */
export async function outsideViewport(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.left < -0.5 || r.right > width + 0.5);
      })
      .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40));
  }, selector);
}
