/**
 * Import an installed app's module by URL. Its own file so tests can stand in
 * for the browser's module loader, which the test runner does not have.
 */
export function loadModule(url: string): Promise<unknown> {
  return import(/* @vite-ignore */ url)
}
