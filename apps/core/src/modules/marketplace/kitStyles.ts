/**
 * A kit app's stylesheets in the page (brief 163). A kit app renders in the
 * desktop's own tree, so its CSS has to be in the desktop's document: each
 * file its build lists becomes one `<link rel="stylesheet">` in `<head>`,
 * tagged with the build it came from.
 *
 * The page is the record. A link is added the first time any app of a build
 * opens and reused by every later window of that build; it is removed when
 * the registry no longer holds the build (an update brought another one, or
 * it was uninstalled), not when a window closes.
 *
 * Eager on purpose: the registry prunes on every sync, so this file is tiny
 * and imports nothing.
 */

const BUILD_ATTR = 'data-kit-build'

/** The most a window waits for a stylesheet before it renders without it. */
const LOAD_TIMEOUT_MS = 10_000

/** Settles when a link this module added has loaded, failed or timed out. */
const settled = new WeakMap<HTMLLinkElement, Promise<void>>()

function linksOf(build: string | null): HTMLLinkElement[] {
  return [...document.head.querySelectorAll<HTMLLinkElement>(`link[${BUILD_ATTR}]`)].filter(
    (l) => build === null || l.getAttribute(BUILD_ATTR) === build
  )
}

function watch(link: HTMLLinkElement): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, LOAD_TIMEOUT_MS)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    link.addEventListener('load', done, { once: true })
    link.addEventListener(
      'error',
      () => {
        // The build was checked to hold the file, so this is the network or a
        // reinstall racing the window. The app still runs, unstyled.
        console.warn(`[marketplace] a kit app's stylesheet did not load: ${link.href}`)
        done()
      },
      { once: true }
    )
  })
}

/**
 * Put `hrefs` in the page for `build` (`<descriptor id>@<build id>`), once:
 * a link already there for that build is reused. Resolves when every one has
 * loaded or failed, so a window can wait for its styles before it renders.
 */
export function addKitStyles(build: string, hrefs: readonly string[]): Promise<void> {
  const present = new Map(linksOf(build).map((l) => [l.getAttribute('href'), l]))
  const waits = hrefs.map((href) => {
    let link = present.get(href)
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.setAttribute(BUILD_ATTR, build)
      link.setAttribute('href', href)
      settled.set(link, watch(link))
      document.head.append(link)
      present.set(href, link)
    }
    return settled.get(link) ?? Promise.resolve()
  })
  return Promise.all(waits).then(() => undefined)
}

/** Remove the links of every build not in `live`. The registry calls it on each sync. */
export function pruneKitStyles(live: ReadonlySet<string>): void {
  for (const link of linksOf(null)) {
    if (!live.has(link.getAttribute(BUILD_ATTR) ?? '')) link.remove()
  }
}
