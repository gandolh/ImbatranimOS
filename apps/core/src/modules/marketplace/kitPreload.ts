import type { MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'
import { addKitStyles } from './kitStyles'
import { kitRefusal, protocolRefusal } from './refusals'

/**
 * A kit app's files start loading as its window opens (brief 182), beside the
 * `KitAppHost` chunk rather than after it.
 *
 * Before, the window mounted, the host's chunk loaded, the host mounted, and
 * only then did its effect import the app's `app.mjs` and add its stylesheets:
 * a round trip per step, and the module's own imports after that. The
 * registry's `lazy` factory calls {@link preloadKitApp} first, so the entry
 * and the styles are on the wire while the host's chunk is.
 *
 * The entry is fetched with `<link rel="modulepreload">`: the browser fetches
 * and parses the module into the page's module map but does not evaluate it.
 * The host's `import()` of the same URL then takes it from there. Evaluation
 * still waits for the import, so `installSharedKit()` still runs before the
 * module reads the global. An `import()` here instead would evaluate the
 * module too, and the shared kit lives in the host's chunk, which has not
 * arrived yet.
 *
 * Eager, like `kitStyles.ts`: the registry imports it, so it is small and
 * imports nothing heavy.
 */

const PRELOAD_ATTR = 'data-kit-preload'

/**
 * Start fetching the module at `href` without evaluating it. Once per URL
 * while a fetch is in flight; the link leaves the page when it settles, and
 * the module stays in the module map. A window closed before then leaves only
 * a fetch the next window's import picks up.
 */
export function preloadModule(href: string): void {
  for (const link of document.head.querySelectorAll<HTMLLinkElement>(`link[${PRELOAD_ATTR}]`)) {
    if (link.getAttribute('href') === href) return
  }
  const link = document.createElement('link')
  link.rel = 'modulepreload'
  link.setAttribute(PRELOAD_ATTR, '')
  link.setAttribute('href', href)
  const settle = () => link.remove()
  link.addEventListener('load', settle, { once: true })
  link.addEventListener('error', settle, { once: true })
  document.head.append(link)
}

/**
 * Start a kit app's entry module and stylesheets as its window opens. A
 * refused app gets nothing (brief 175: nothing is fetched or added for it),
 * nor does an app with no entry or build, which the host reports itself.
 * `build` is the app's build key (`kitBuildKey`), passed in so this file
 * needs nothing from the registry at run time.
 */
export function preloadKitApp(app: MarketplaceApp, build: string | null): void {
  if (protocolRefusal(app) ?? kitRefusal(app)) return
  const entryPath = app.installed?.entryPath
  if (!entryPath || !build) return
  preloadModule(apiUrl(entryPath).href)
  // The host adds the same links again and waits for them; addKitStyles
  // reuses a build's links, so this only starts them sooner.
  void addKitStyles(
    build,
    (app.installed?.stylePaths ?? []).map((p) => apiUrl(p).href)
  )
}
