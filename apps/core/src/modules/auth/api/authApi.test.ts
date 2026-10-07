import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../lib/axios', () => ({ api: { get } }))

import { getStatus } from './authApi'

/** The session probe: 200 is signed in, anything else is signed out. */
describe('getStatus', () => {
  beforeEach(() => get.mockReset())

  it('probes /me', async () => {
    get.mockResolvedValueOnce({ data: { user: { subject: 'local-owner', username: 'gandolh' } } })
    await getStatus()
    expect(get).toHaveBeenCalledWith('/me')
  })

  it('200 is signed in, with the session', async () => {
    get.mockResolvedValueOnce({ data: { user: { subject: 'local-owner', username: 'gandolh' } } })
    expect(await getStatus()).toEqual({
      authenticated: true,
      session: { subject: 'local-owner', username: 'gandolh' },
    })
  })

  it('401 is signed out', async () => {
    get.mockRejectedValueOnce({ response: { status: 401 } })
    expect(await getStatus()).toEqual({ authenticated: false, session: null })
  })

  it('a network failure is signed out too', async () => {
    get.mockRejectedValueOnce(new Error('Network Error'))
    expect(await getStatus()).toEqual({ authenticated: false, session: null })
  })
})
