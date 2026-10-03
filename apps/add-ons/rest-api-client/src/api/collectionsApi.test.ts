import { describe, expect, it } from 'vitest'
import type { SystemHttp } from '@imbatranim/ui'
import { loadData } from './collectionsApi'

// Brief 139: only a 404 may be read as "start empty". Everything else must reach
// the caller as a failure, or the next whole-file save replaces data nobody saw.

function httpGetting(result: { content: string } | { error: unknown }): SystemHttp {
  return {
    get: () =>
      'error' in result
        ? Promise.reject(result.error)
        : Promise.resolve({
            data: { path: 'x', content: result.content },
            status: 200,
            headers: {},
          }),
  } as unknown as SystemHttp
}

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  })

describe('loadData', () => {
  it('reads a 404 as a first run', async () => {
    expect(await loadData(httpGetting({ error: httpError(404) }))).toEqual({ status: 'missing' })
  })

  it.each([401, 500, 503])('reports a %i as a failure, not as empty', async (status) => {
    const result = await loadData(httpGetting({ error: httpError(status) }))
    expect(result).toEqual({
      status: 'failed',
      error: `the files service answered ${status}`,
      malformed: false,
    })
  })

  it('reports a network error as a failure', async () => {
    const result = await loadData(httpGetting({ error: new Error('Network Error') }))
    expect(result).toEqual({ status: 'failed', error: 'Network Error', malformed: false })
  })

  it('reports malformed JSON as a failure that names the position', async () => {
    // A hand edit that dropped a comma, in a file shaped like the one saveData writes.
    const content = JSON.stringify(
      { collections: [{ id: 'a', url: 'https://a.test' }], history: [] },
      null,
      2
    ).replace('"a",', '"a"')
    const result = await loadData(httpGetting({ content }))
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.malformed).toBe(true)
    expect(result.error).toMatch(/^collections\.json is not valid JSON: .*line \d+ column \d+/)
  })

  it('normalises a valid doc', async () => {
    const result = await loadData(
      httpGetting({
        content: JSON.stringify({
          collections: [{ id: 'a', name: 'A', method: 'GET', url: 'https://a.test' }],
          history: 'not an array',
          activeEnvId: 'gone',
        }),
      })
    )
    expect(result).toEqual({
      status: 'ok',
      data: {
        collections: [{ id: 'a', name: 'A', method: 'GET', url: 'https://a.test' }],
        history: [],
        environments: [],
        activeEnvId: null,
      },
    })
  })
})
