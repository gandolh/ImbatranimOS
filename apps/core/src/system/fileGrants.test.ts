// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../lib/axios', () => ({ api: { post, get: vi.fn(async () => ({ data: [] })) } }))

import { grantFile, grantsSettled } from './fileGrants'
import { openApp } from '../shared/intents/openApp'
import { useWindowStore } from '../shared/store/windowStore'
import { useIntentStore } from '../shared/store/intentStore'
import { useAddonStore } from '../shared/store/addonStore'

/** A promise and the function that settles it, for holding a call open. */
function deferred() {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: undefined })
  useWindowStore.setState({ windows: [], nextZIndex: 1, closeGuards: {}, activeWorkspace: 1 })
  useIntentStore.setState({ intents: new Map() })
  useAddonStore.setState({ disabled: [] })
})

describe('grantFile', () => {
  it('gives the copy the path as the user, saying what the dialog gave', async () => {
    await grantFile(
      { appId: 'hollow', instanceId: 'w1' },
      { root: 'home', path: 'Documents' },
      'folder'
    )
    expect(post).toHaveBeenCalledWith('/files/grants', {
      instanceId: 'w1',
      appId: 'hollow',
      root: 'home',
      path: 'Documents',
      expect: 'folder',
    })
  })

  it('holds the copy’s calls until its grants settle, and no other copy’s', async () => {
    const held = deferred()
    post.mockReturnValueOnce(held.promise)
    void grantFile({ appId: 'hollow', instanceId: 'w2' }, { root: 'home', path: 'a.txt' })

    let settled = false
    void grantsSettled('w2').then(() => {
      settled = true
    })
    await expect(grantsSettled('other')).resolves.toBeUndefined()
    await Promise.resolve()
    expect(settled).toBe(false)

    held.resolve()
    await grantsSettled('w2')
    expect(settled).toBe(true)
  })

  it('a refused grant settles too: the app meets the 403 instead of waiting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    post.mockRejectedValueOnce(new Error('Request failed with status code 403'))
    await expect(
      grantFile({ appId: 'hollow', instanceId: 'w3' }, { root: 'home', path: 'a.txt' })
    ).resolves.toBeUndefined()
    await expect(grantsSettled('w3')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('openApp gives the file it opens', () => {
  const grants = () => post.mock.calls.filter(([url]) => url === '/files/grants')

  it('to the new window, before the app can read it', async () => {
    const id = openApp('notepad', { openPath: 'Documents/a.txt', root: 'home' })
    await grantsSettled(id)
    expect(grants()).toEqual([
      [
        '/files/grants',
        { instanceId: id, appId: 'notepad', root: 'home', path: 'Documents/a.txt' },
      ],
    ])
  })

  it('to the open window of a single-instance app it re-delivers to', async () => {
    const id = openApp('todo')
    expect(openApp('todo', { openPath: 'lists/today.json', root: 'home' })).toBe(id)
    await grantsSettled(id)
    expect(grants()).toEqual([
      ['/files/grants', { instanceId: id, appId: 'todo', root: 'home', path: 'lists/today.json' }],
    ])
  })

  it('not to Files, which acts as the user, nor without a file', async () => {
    const files = openApp('file-manager', { openPath: 'Documents', root: 'home' })
    const notepad = openApp('notepad')
    await Promise.all([grantsSettled(files), grantsSettled(notepad), Promise.resolve()])
    expect(grants()).toEqual([])
  })
})
