import { lazy } from 'react'
import { Globe } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'

/**
 * The Browser (brief 50). Open a page from another app with
 * `openApp('browser', { url })`; only http(s) URLs are honoured.
 */
export const manifest: AddonManifest = {
  id: 'browser',
  name: 'Browser',
  description: 'Browse the web through this machine',
  meta: ['web', 'internet', 'www', 'google', 'youtube', 'chrome', 'firefox', 'url'],
  icon: Globe,
  component: lazy(() => import('./Browser').then((m) => ({ default: m.Browser }))),
  // One window for the first cut: the profile and the relay are per machine.
  multiInstance: false,
  defaultSize: { width: 1024, height: 720 },
  minSize: { width: 420, height: 320 },
}
