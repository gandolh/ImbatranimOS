// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { SHARED_KIT_VERSION } from '@imbatranim/ui'
import type { MarketplaceApp } from '../../shared/registry/marketplace'
import { preloadKitApp, preloadModule } from './kitPreload'

/**
 * Brief 182: a kit app's entry and styles start loading as its window opens,
 * beside the host's chunk. The entry is preloaded, never evaluated here.
 */

const ENTRY = 'marketplace/apps/office/b/b1/pdf/app.mjs'
const STYLE = 'marketplace/apps/office/b/b1/pdf/app.css'

function kitApp(over: Partial<MarketplaceApp> = {}): MarketplaceApp {
  return {
    id: 'office-pdf',
    descriptorId: 'office',
    descriptorName: 'Office',
    name: 'PDF',
    description: '',
    meta: [],
    type: 'static',
    icon: 'file-text',
    window: { defaultSize: { w: 800, h: 600 }, minSize: { w: 400, h: 300 } },
    capabilities: [],
    multiInstance: true,
    opens: ['pdf'],
    minSystemVersion: 2,
    ref: 'a'.repeat(40),
    runtime: 'native',
    sharedKit: SHARED_KIT_VERSION,
    installed: {
      ref: 'a'.repeat(40),
      buildId: 'b1',
      installedAt: 0,
      entryPath: ENTRY,
      stylePaths: [STYLE],
      missing: false,
    },
    job: null,
    server: { state: 'stopped' },
    ...over,
  }
}

const preloads = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((l) =>
    l.getAttribute('href')
  )
const styles = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) =>
    l.getAttribute('href')
  )

afterEach(() => {
  document.head.innerHTML = ''
})

describe('preloadModule', () => {
  it('adds one modulepreload link per URL while it is in flight', () => {
    preloadModule('/api/x/app.mjs')
    preloadModule('/api/x/app.mjs')
    expect(preloads()).toEqual(['/api/x/app.mjs'])
  })

  it('takes the link out once the fetch settles, either way', () => {
    preloadModule('/api/x/app.mjs')
    preloadModule('/api/y/app.mjs')
    const [x, y] = document.head.querySelectorAll('link[rel="modulepreload"]')
    x.dispatchEvent(new Event('load'))
    y.dispatchEvent(new Event('error'))
    expect(preloads()).toEqual([])
    // A later window may preload again; the module map has it by then.
    preloadModule('/api/x/app.mjs')
    expect(preloads()).toEqual(['/api/x/app.mjs'])
  })
})

describe('preloadKitApp', () => {
  it("starts the entry and the build's stylesheets", () => {
    preloadKitApp(kitApp(), 'office@b1')
    expect(preloads()).toEqual([new URL(`/api/${ENTRY}`, location.href).href])
    expect(styles()).toEqual([new URL(`/api/${STYLE}`, location.href).href])
    expect(
      document.head.querySelector('link[rel="stylesheet"]')?.getAttribute('data-kit-build')
    ).toBe('office@b1')
  })

  it('fetches nothing for an app built for another shared kit (brief 175)', () => {
    preloadKitApp(kitApp({ sharedKit: SHARED_KIT_VERSION + 98 }), 'office@b1')
    expect(document.head.querySelectorAll('link')).toHaveLength(0)
  })

  it('fetches nothing for an app that needs a newer protocol (brief 175)', () => {
    preloadKitApp(kitApp({ minSystemVersion: 99 }), 'office@b1')
    expect(document.head.querySelectorAll('link')).toHaveLength(0)
  })

  it('fetches nothing without an entry or a build', () => {
    preloadKitApp(kitApp({ installed: null }), null)
    expect(document.head.querySelectorAll('link')).toHaveLength(0)
  })
})
