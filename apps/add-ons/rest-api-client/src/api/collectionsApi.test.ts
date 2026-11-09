import { describe, expect, it } from 'vitest'
import { FileConflictError, type SystemData, type SystemHttp } from '@imbatranim/ui'
import { DATA_FILE, loadData, saveData, type CollectionsSystem } from './collectionsApi'

/*
 * The doc lives in the app's data folder. Only a missing doc may be read as
 * "start empty"; everything else reaches the caller as a failure, or the next
 * whole-file save replaces data nobody saw. The doc from before the folder
 * moves in once, and its original goes only after the copy reads back the
 * same.
 */

const LEGACY = '.config/rest-client/collections.json'

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  })

/** A data folder and a home, in memory, behind `system.data` and the files routes. */
function world() {
  const folder = new Map<string, string>()
  const home = new Map<string, string>()
  const fail: {
    read?: unknown
    write?: unknown
    legacyStatus?: number
    deleteLegacy?: boolean
    /** Runs between the move's write and its read-back: another window saving. */
    afterWrite?: () => void
  } = {}
  const writes: { path: string; content: string; expected: string | null | undefined }[] = []
  const version = (content: string) => `v${content.length}:${content}`

  const data: SystemData = {
    async read(path) {
      if (fail.read) throw fail.read
      const content = folder.get(path)
      return content === undefined ? null : { content, version: version(content) }
    },
    async write(path, content, opts) {
      if (fail.write) throw fail.write
      writes.push({ path, content, expected: opts?.expected })
      const now = folder.get(path)
      const current = now === undefined ? null : version(now)
      if (opts?.expected !== undefined && opts.expected !== current) {
        throw new FileConflictError(current)
      }
      folder.set(path, content)
      const after = fail.afterWrite
      fail.afterWrite = undefined
      after?.()
      return { version: version(content) }
    },
    list: async () => [],
    remove: async () => undefined,
  }

  const ok = <T>(body: T) => ({ data: body, status: 200, headers: {} })
  const http = {
    async get(url: string, cfg?: { params?: { root?: string; path?: string } }) {
      const path = cfg?.params?.path ?? ''
      if (url === '/files/content') {
        if (path === LEGACY && fail.legacyStatus) throw httpError(fail.legacyStatus)
        const content = home.get(path)
        if (content === undefined) throw httpError(404)
        return ok({ path, content })
      }
      if (url === '/files') {
        return ok(
          [...home.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => ({ path: k }))
        )
      }
      throw new Error(`unexpected GET ${url}`)
    },
    async delete(url: string, cfg?: { params?: { path?: string } }) {
      const path = cfg?.params?.path ?? ''
      if (url !== '/files') throw new Error(`unexpected DELETE ${url}`)
      if (path === LEGACY && fail.deleteLegacy) throw httpError(500)
      home.delete(path)
      home.delete(`${path}/`)
      return ok(undefined)
    },
  } as unknown as SystemHttp

  const system: CollectionsSystem = { data, http }
  return { system, folder, home, fail, writes, version }
}

const doc = (urls: string[]) =>
  JSON.stringify({ collections: urls.map((u) => ({ id: u, url: u })), history: [] }, null, 2)

describe('loadData', () => {
  it('reads the doc in the data folder, with its version', async () => {
    const w = world()
    w.folder.set('collections.json', doc(['https://a.test']))
    const result = await loadData(w.system)
    expect(result).toMatchObject({
      status: 'ok',
      version: w.version(doc(['https://a.test'])),
      data: { collections: [{ url: 'https://a.test' }] },
    })
  })

  it('reads no doc anywhere as a first run', async () => {
    expect(await loadData(world().system)).toEqual({ status: 'missing' })
  })

  it.each([401, 500, 503])(
    'reports a %i from the data folder as a failure, not as empty',
    async (status) => {
      const w = world()
      w.fail.read = httpError(status)
      expect(await loadData(w.system)).toEqual({
        status: 'failed',
        error: `the data folder answered ${status}`,
        malformed: false,
      })
    }
  )

  it('reports a network error as a failure', async () => {
    const w = world()
    w.fail.read = new Error('Network Error')
    expect(await loadData(w.system)).toEqual({
      status: 'failed',
      error: 'Network Error',
      malformed: false,
    })
  })

  it('reports a malformed doc with the position, and where to repair it', async () => {
    const w = world()
    w.folder.set('collections.json', doc(['https://a.test']).replace('"https://a.test",', '"a"'))
    const result = await loadData(w.system)
    expect(result).toMatchObject({ status: 'failed', malformed: true, file: DATA_FILE })
    if (result.status !== 'failed') return
    expect(result.error).toMatch(/^collections\.json is not valid JSON: .*line \d+ column \d+/)
  })

  it('normalises a valid doc', async () => {
    const w = world()
    w.folder.set(
      'collections.json',
      JSON.stringify({
        collections: [{ id: 'a', name: 'A', method: 'GET', url: 'https://a.test' }],
        history: 'not an array',
        activeEnvId: 'gone',
      })
    )
    expect(await loadData(w.system)).toMatchObject({
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

describe('the move from ~/.config/rest-client', () => {
  it('copies the old doc byte for byte, then removes it and its empty folder', async () => {
    const w = world()
    const old = doc(['https://kept.test'])
    w.home.set(LEGACY, old)
    const result = await loadData(w.system)
    expect(result).toMatchObject({
      status: 'ok',
      version: w.version(old),
      data: { collections: [{ url: 'https://kept.test' }] },
    })
    expect(w.folder.get('collections.json')).toBe(old)
    expect(w.writes).toEqual([{ path: 'collections.json', content: old, expected: null }])
    expect(w.home.has(LEGACY)).toBe(false)
  })

  it('keeps the old folder when something else is in it', async () => {
    const w = world()
    w.home.set(LEGACY, doc([]))
    w.home.set('.config/rest-client/notes.txt', 'mine')
    await loadData(w.system)
    expect(w.home.has(LEGACY)).toBe(false)
    expect(w.home.get('.config/rest-client/notes.txt')).toBe('mine')
  })

  it('runs once: a second load reads the folder and writes nothing', async () => {
    const w = world()
    w.home.set(LEGACY, doc(['https://a.test']))
    await loadData(w.system)
    await loadData(w.system)
    expect(w.writes).toHaveLength(1)
  })

  it('moves nothing and removes nothing when the old doc is malformed', async () => {
    const w = world()
    w.home.set(LEGACY, '{ "collections": [ }')
    const result = await loadData(w.system)
    expect(result).toMatchObject({
      status: 'failed',
      malformed: true,
      file: { root: 'home', path: LEGACY },
    })
    expect(w.writes).toEqual([])
    expect(w.home.get(LEGACY)).toBe('{ "collections": [ }')
  })

  it('writes nothing when the old doc can’t be read, and says why', async () => {
    const w = world()
    w.home.set(LEGACY, doc([]))
    w.fail.legacyStatus = 503
    expect(await loadData(w.system)).toEqual({
      status: 'failed',
      error: 'the files service answered 503',
      malformed: false,
    })
    expect(w.writes).toEqual([])
  })

  it('reads an old doc this app may not read as nothing to move, says where it may be, and leaves it', async () => {
    const w = world()
    w.home.set(LEGACY, doc(['https://a.test']))
    w.fail.legacyStatus = 403
    expect(await loadData(w.system)).toEqual({
      status: 'missing',
      earlier: { root: 'home', path: '.config/rest-client/collections.json' },
    })
    expect(w.home.has(LEGACY)).toBe(true)
  })

  it('a window that moved it first wins: this one reads theirs', async () => {
    const w = world()
    const old = doc(['https://kept.test'])
    w.home.set(LEGACY, old)
    w.folder.set('collections.json', old)
    // As if the other window wrote between this one's read and its write.
    const read = w.system.data!.read
    let first = true
    w.system.data!.read = async (path, opts) => {
      if (first) {
        first = false
        return null
      }
      return read(path, opts)
    }
    const result = await loadData(w.system)
    expect(result).toMatchObject({
      status: 'ok',
      data: { collections: [{ url: 'https://kept.test' }] },
    })
    expect(w.folder.get('collections.json')).toBe(old)
    expect(w.home.has(LEGACY)).toBe(false)
  })

  it('keeps the original when the copy no longer reads back the same', async () => {
    const w = world()
    w.home.set(LEGACY, doc(['https://old.test']))
    w.fail.afterWrite = () => w.folder.set('collections.json', doc(['https://newer.test']))
    await loadData(w.system)
    expect(w.home.has(LEGACY)).toBe(true)
  })

  it('finishes a removal that failed, on the next load', async () => {
    const w = world()
    w.home.set(LEGACY, doc(['https://a.test']))
    w.fail.deleteLegacy = true
    expect(await loadData(w.system)).toMatchObject({ status: 'ok' })
    expect(w.home.has(LEGACY)).toBe(true)
    w.fail.deleteLegacy = false
    await loadData(w.system)
    expect(w.home.has(LEGACY)).toBe(false)
    expect(w.writes).toHaveLength(1)
  })

  it('never removes an old doc that differs from the one in the folder', async () => {
    const w = world()
    w.folder.set('collections.json', doc(['https://now.test']))
    w.home.set(LEGACY, doc(['https://restored.test']))
    await loadData(w.system)
    expect(w.home.get(LEGACY)).toBe(doc(['https://restored.test']))
  })
})

describe('saveData', () => {
  it('saves over the version it was given and answers the new one', async () => {
    const w = world()
    const first = await saveData(
      w.system,
      { collections: [], history: [], environments: [], activeEnvId: null },
      null
    )
    expect(w.writes.at(-1)?.expected).toBeNull()
    const second = await saveData(
      w.system,
      { collections: [], history: [{ id: 'h' } as never], environments: [], activeEnvId: null },
      first
    )
    expect(w.writes.at(-1)?.expected).toBe(first)
    expect(second).not.toBe(first)
  })

  it('throws FileConflictError when another window saved since', async () => {
    const w = world()
    w.folder.set('collections.json', doc(['https://theirs.test']))
    await expect(
      saveData(
        w.system,
        { collections: [], history: [], environments: [], activeEnvId: null },
        'stale'
      )
    ).rejects.toBeInstanceOf(FileConflictError)
    expect(w.folder.get('collections.json')).toBe(doc(['https://theirs.test']))
  })

  it('bounds the history to 50', async () => {
    const w = world()
    const history = Array.from({ length: 60 }, (_, i) => ({ id: `h${i}` })) as never[]
    await saveData(
      w.system,
      { collections: [], history, environments: [], activeEnvId: null },
      null
    )
    expect(JSON.parse(w.folder.get('collections.json')!).history).toHaveLength(50)
  })
})
