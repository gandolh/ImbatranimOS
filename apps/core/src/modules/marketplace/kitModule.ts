import type { MarketplaceApp } from '../../shared/registry/marketplace'
import { apiUrl } from './apiUrl'
import { loadModule } from './loadModule'
import { kitRefusal, protocolRefusal } from './refusals'
import { installSharedKit } from './sharedKit'

/** A kit app's entry module per URL, imported at most once at a time (brief 182). */
const imports = new Map<string, Promise<unknown>>()

/**
 * Import a kit app's entry module. The shared kit goes on the global first:
 * the module reads it as it evaluates. Once per URL, so the registry's early
 * start and the host's effect share one import; a failed one is forgotten, so
 * a later window tries again rather than inheriting the failure.
 */
export function importKitModule(href: string): Promise<unknown> {
  const started = imports.get(href)
  if (started) return started
  installSharedKit()
  const loading = loadModule(href)
  imports.set(href, loading)
  loading.catch(() => {
    if (imports.get(href) === loading) imports.delete(href)
  })
  return loading
}

/**
 * Start a kit app's import as soon as this chunk has arrived (brief 182),
 * before the host mounts. The registry's `lazy` factory calls it: React holds
 * a lazy component that resolves just after its fallback showed for up to
 * 300 ms before it commits, and the host's effect ran only after that, so the
 * module graph (the entry's own imports, which a modulepreload does not
 * fetch) loaded after the wait. Nothing for a refused app (brief 175) or one
 * without an entry; the host reports a failure in its window.
 */
export function startKitApp(app: MarketplaceApp): void {
  if (protocolRefusal(app) ?? kitRefusal(app)) return
  const entryPath = app.installed?.entryPath
  if (!entryPath) return
  importKitModule(apiUrl(entryPath).href).catch(() => undefined)
}
