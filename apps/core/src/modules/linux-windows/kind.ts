/**
 * Linux windows are their own kind of OS window: no add-on, no manifest. A
 * window whose app id starts with this prefix shows a Linux app's toplevel;
 * the rest of the id is the app's own (`linux:foot`).
 *
 * Kept free of imports so the window store can read it without a cycle.
 */
export const LINUX_APP_PREFIX = 'linux:'

export function isLinuxWindow(appId: string): boolean {
  return appId.startsWith(LINUX_APP_PREFIX)
}

/**
 * The OS window's frame around a Linux app's image: a 1px border on each
 * side and the 30px title bar. An OS window sized to an image plus this shows
 * the image exactly.
 */
export const LINUX_WINDOW_CHROME = { width: 2, height: 32 }
