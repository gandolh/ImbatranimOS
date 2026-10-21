// @vitest-environment jsdom
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Kit from '@imbatranim/ui'
import { SHARED_KIT_MODULES, SHARED_KIT_VERSION, type SharedKitModule } from '@imbatranim/ui'
import { describe, expect, it } from 'vitest'
import { installSharedKit, sharedKit } from './sharedKit'

/**
 * Brief 163, contract A: the desktop's own modules on
 * `globalThis.__imbatranimShared`, for a kit app's build to read its imports
 * from. Identity is the point: the `useSystem` a kit app calls must read the
 * desktop's context, so every value is the desktop's own, not a copy.
 */

/** Every export of a module, as the bundler handed it over: a CommonJS package's are on `default`. */
function exportsOf(ns: object): Record<string, unknown> {
  const cjs = (ns as { default?: unknown }).default
  return { ...(cjs && typeof cjs === 'object' ? cjs : {}), ...ns }
}

const DESKTOP: Record<SharedKitModule, object> = {
  react: React,
  'react/jsx-runtime': JsxRuntime,
  'react-dom': ReactDom,
  'react-dom/client': ReactDomClient,
  '@imbatranim/ui': Kit,
}

describe('the shared kit global (brief 163)', () => {
  it('is absent until the first kit app needs it, then the same object every time', () => {
    expect(sharedKit()).toBeUndefined()
    expect('__imbatranimShared' in globalThis).toBe(false)
    const shared = installSharedKit()
    expect(installSharedKit()).toBe(shared)
    expect(sharedKit()).toBe(shared)
    expect((globalThis as { __imbatranimShared?: unknown }).__imbatranimShared).toBe(shared)
  })

  it('names its version and the five modules', () => {
    const shared = installSharedKit()
    expect(shared.version).toBe(SHARED_KIT_VERSION)
    expect(SHARED_KIT_VERSION).toBe(1)
    expect(Object.keys(shared.modules)).toEqual([...SHARED_KIT_MODULES])
  })

  it('is frozen through, and cannot be replaced', () => {
    const shared = installSharedKit()
    expect(Object.isFrozen(shared)).toBe(true)
    expect(Object.isFrozen(shared.modules)).toBe(true)
    for (const mod of Object.values(shared.modules)) expect(Object.isFrozen(mod)).toBe(true)
    expect(() => {
      ;(globalThis as { __imbatranimShared?: unknown }).__imbatranimShared = {}
    }).toThrow(TypeError)
    expect(() => Object.defineProperty(globalThis, '__imbatranimShared', { value: {} })).toThrow(
      TypeError
    )
    expect(sharedKit()).toBe(shared)
  })

  it.each(Object.keys(DESKTOP))(
    'hands over every export of %s as the desktop’s own value',
    (spec) => {
      const mod = installSharedKit().modules[spec as SharedKitModule]
      const desktop = exportsOf(DESKTOP[spec as SharedKitModule])
      expect(Object.keys(desktop).length).toBeGreaterThan(0)
      for (const [name, value] of Object.entries(desktop)) expect(mod[name]).toBe(value)
    }
  )

  it('carries what a kit app reads as it evaluates', () => {
    const { modules } = installSharedKit()
    expect(modules.react.useState).toBe(React.useState)
    expect(modules.react.createContext).toBe(React.createContext)
    expect(typeof modules['react/jsx-runtime'].jsx).toBe('function')
    expect(typeof modules['react/jsx-runtime'].jsxs).toBe('function')
    expect(modules['react/jsx-runtime'].Fragment).toBe(React.Fragment)
    expect(modules['react-dom'].createPortal).toBe(ReactDom.createPortal)
    expect(modules['react-dom/client'].createRoot).toBe(ReactDomClient.createRoot)
    const kit = modules['@imbatranim/ui']
    expect(kit.useSystem).toBe(Kit.useSystem)
    expect(kit.SystemProvider).toBe(Kit.SystemProvider)
    expect(kit.Button).toBe(Kit.Button)
    expect(kit.ConfirmDialog).toBe(Kit.ConfirmDialog)
    expect(kit.saveOverRead).toBe(Kit.saveOverRead)
    expect(kit.SHARED_KIT_VERSION).toBe(SHARED_KIT_VERSION)
    // The kit is ES modules through: no default to reach for.
    expect('default' in kit).toBe(false)
  })
})
