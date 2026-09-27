import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../lib/axios', () => ({ api: { get } }))

import { getStatus, wardLoginUrl } from './authApi'

/**
 * Brief 137 — the session probe's four answers. Each maps to a different
 * screen, and conflating any two of them is a loop: a 403 or a 503 shown as
 * "signed out" sends somebody to a sign-in that returns them straight here.
 */
describe('getStatus', () => {
  beforeEach(() => get.mockReset())

  const failWith = (status: number) => get.mockRejectedValueOnce({ response: { status } })

  it('probes /me', async () => {
    get.mockResolvedValueOnce({ data: { user: { subject: 's1', username: 'gandolh' } } })
    await getStatus()
    expect(get).toHaveBeenCalledWith('/me')
  })

  it('200 is signed in, with the session', async () => {
    get.mockResolvedValueOnce({ data: { user: { subject: 's1', username: 'gandolh' } } })
    expect(await getStatus()).toEqual({
      authenticated: true,
      session: { subject: 's1', username: 'gandolh' },
      unavailable: false,
      forbidden: false,
    })
  })

  it('401 is signed out', async () => {
    failWith(401)
    expect(await getStatus()).toEqual({
      authenticated: false,
      session: null,
      unavailable: false,
      forbidden: false,
    })
  })

  it('403 is forbidden, not signed out', async () => {
    failWith(403)
    expect(await getStatus()).toEqual({
      authenticated: false,
      session: null,
      unavailable: false,
      forbidden: true,
    })
  })

  it('503 is unavailable, not signed out', async () => {
    failWith(503)
    expect(await getStatus()).toEqual({
      authenticated: false,
      session: null,
      unavailable: true,
      forbidden: false,
    })
  })
})

describe('wardLoginUrl', () => {
  it('returns to the build base, which Ward accepts as an estate root', () => {
    // Vite's BASE_URL is `/` under test and `/imbatranim-os/` in the deploy;
    // the point is that it is no longer the literal `/os/` Ward rejected.
    expect(wardLoginUrl()).toBe(`/ward/login?next=${encodeURIComponent(import.meta.env.BASE_URL)}`)
  })
})
