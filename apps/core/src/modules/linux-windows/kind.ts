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
 * The OS window's frame around a Linux app's window: a 1px border on each
 * side, plus the 30px title bar when the app asked the display to draw it.
 * An app that draws its own title bar gets the frame alone. An OS window
 * sized to the app's window plus this shows it exactly.
 */
export function linuxWindowChrome(serverSide: boolean): { width: number; height: number } {
  return serverSide ? { width: 2, height: 32 } : { width: 2, height: 2 }
}
