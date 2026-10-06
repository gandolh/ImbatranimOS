// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createSystemHandle } from '../../system/createSystemHandle'
import { scopeHandle } from './scopeHandle'

/**
 * Brief 120 — a marketplace app's handle carries only the capabilities its
 * descriptor asked for. A fence for mistakes (the code is curated, and runs
 * in this page), so what matters is that a missing one fails loudly and names
 * itself.
 */
describe('scopeHandle', () => {
  const base = createSystemHandle('hollow', null)

  it('passes granted capabilities and the always-present members through', () => {
    const scoped = scopeHandle(base, ['notify', 'fs'], 'Hollow')
    expect(scoped.fs).toBe(base.fs)
    expect(typeof scoped.notify).toBe('function')
    expect(scoped.appId).toBe('hollow')
    expect(scoped.protocolVersion).toBe(base.protocolVersion)
    expect(scoped.window).toBe(base.window)
    expect(scoped.appearance).toBe(base.appearance)
    expect(typeof scoped.on).toBe('function')
  })

  it.each(['fs', 'http', 'intents', 'notify', 'shortcuts', 'schedule'] as const)(
    'refuses system.%s when it was not granted, by name',
    (cap) => {
      const scoped = scopeHandle(base, [], 'Hollow')
      expect(() => scoped[cap]).toThrow(`Hollow did not ask for system.${cap}`)
    }
  )
})
