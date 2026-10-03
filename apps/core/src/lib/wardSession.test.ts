// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import {
  WARD_REFRESHED_EVENT,
  noteSessionFresh,
  refreshWardSession,
  resetWardSessionForTest,
  startProactiveRefresh,
} from './wardSession'
import { api } from './axios'

/** Brief 144 — the session outlives its 15-minute access token. */

const fetchMock = vi.fn<typeof fetch>()

function answer(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetWardSessionForTest()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('refreshWardSession', () => {
  it('shares one refresh between ten concurrent callers', async () => {
    let release!: () => void
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (release = () => resolve(answer(200))))
    )
    const calls = Array.from({ length: 10 }, () => refreshWardSession())
    release()
    expect(await Promise.all(calls)).toEqual(Array(10).fill(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/ward-api/refresh', {
      method: 'POST',
      credentials: 'include',
    })
  })

  it('a later refresh is a new request', async () => {
    fetchMock.mockResolvedValue(answer(200))
    await refreshWardSession()
    await refreshWardSession()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('announces a successful refresh', async () => {
    fetchMock.mockResolvedValue(answer(200))
    const heard = vi.fn()
    window.addEventListener(WARD_REFRESHED_EVENT, heard)
    await refreshWardSession()
    window.removeEventListener(WARD_REFRESHED_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403, 404])('a %i means the session cannot be renewed', async (status) => {
    fetchMock.mockResolvedValue(answer(status, { error: 'invalid_refresh' }))
    expect(await refreshWardSession()).toBe(false)
  })

  it('a 5xx or a network error throws, which is not a sign-out', async () => {
    fetchMock.mockResolvedValueOnce(answer(502))
    await expect(refreshWardSession()).rejects.toThrow('502')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(refreshWardSession()).rejects.toThrow('Failed to fetch')
  })
})

describe('proactive refresh', () => {
  it("refreshes a minute before Ward's stated expiry", async () => {
    vi.useFakeTimers()
    const now = Date.now()
    fetchMock.mockResolvedValue(
      answer(200, { accessTokenExpiresAt: new Date(now + 15 * 60_000).toISOString() })
    )
    const stop = startProactiveRefresh()
    noteSessionFresh(now + 5 * 60_000)

    await vi.advanceTimersByTimeAsync(4 * 60_000 - 1_000)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // The refresh's own expiry schedules the next one 14 minutes later.
    await vi.advanceTimersByTimeAsync(14 * 60_000 + 1_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does nothing once stopped', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(answer(200))
    const stop = startProactiveRefresh()
    noteSessionFresh(Date.now() + 2 * 60_000)
    stop()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the axios interceptor', () => {
  const original = api.defaults.adapter
  let apiStatuses: number[]
  let unauthorized: ReturnType<typeof vi.fn<() => void>>

  const respond: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const status = apiStatuses.shift() ?? 200
    const response: AxiosResponse = {
      data: { ok: status < 400 },
      status,
      statusText: String(status),
      headers: {},
      config,
    }
    if (status >= 400) {
      throw Object.assign(new Error(`Request failed with status code ${status}`), {
        config,
        response,
        isAxiosError: true,
      })
    }
    return response
  }

  beforeEach(() => {
    api.defaults.adapter = respond
    unauthorized = vi.fn<() => void>()
    window.addEventListener('auth:unauthorized', unauthorized)
  })

  afterEach(() => {
    api.defaults.adapter = original
    window.removeEventListener('auth:unauthorized', unauthorized)
  })

  it('a 401 refreshes and replays the request once', async () => {
    apiStatuses = [401, 200]
    fetchMock.mockResolvedValue(answer(200))
    const res = await api.get('/notes')
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it('a refused refresh covers the desktop', async () => {
    apiStatuses = [401]
    fetchMock.mockResolvedValue(answer(401, { error: 'invalid_refresh' }))
    await expect(api.get('/notes')).rejects.toMatchObject({ response: { status: 401 } })
    expect(unauthorized).toHaveBeenCalledTimes(1)
  })

  it('a 401 again after a refresh is not retried a second time', async () => {
    apiStatuses = [401, 401, 200]
    fetchMock.mockResolvedValue(answer(200))
    await expect(api.get('/notes')).rejects.toMatchObject({ response: { status: 401 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(unauthorized).toHaveBeenCalledTimes(1)
  })

  it('a refresh that cannot reach Ward signs nobody out', async () => {
    apiStatuses = [401]
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.get('/notes')).rejects.toMatchObject({ response: { status: 401 } })
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it('other errors pass straight through', async () => {
    apiStatuses = [500]
    await expect(api.get('/notes')).rejects.toMatchObject({ response: { status: 500 } })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
