// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { post, del } = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }))
vi.mock('../../lib/axios', () => ({ api: { post, delete: del } }))

import { InstallFromUrl } from './InstallFromUrl'
import type { Inspection } from './urlApps'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const COMMIT = 'abcdef0123456789abcdef0123456789abcdef01'
function inspection(over: Partial<Inspection> = {}): Inspection {
  return {
    pending: 'p1',
    id: 'x-123',
    manifest: {
      name: 'Hollow',
      description: 'A small town sim.',
      meta: [],
      icon: 'gamepad-2',
      capabilities: ['notify'],
    },
    source: {
      url: 'https://github.com/o/r/tree/main/sub',
      repo: 'https://github.com/o/r',
      ref: 'main',
      commit: COMMIT,
      subdir: 'sub',
    },
    current: null,
    ...over,
  }
}

let container: HTMLDivElement
let root: Root
const onInstalled = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement

async function check(url = 'https://github.com/o/r') {
  await act(async () => {
    root.render(<InstallFromUrl onInstalled={onInstalled} />)
  })
  const input = container.querySelector('input') as HTMLInputElement
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, url)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('InstallFromUrl', () => {
  it('shows the consent card after a check', async () => {
    post.mockResolvedValueOnce({ data: inspection() })
    await check()
    expect(post).toHaveBeenCalledWith('/marketplace/url/inspect', { url: 'https://github.com/o/r' })
    const text = container.textContent!
    expect(text).toContain('github.com/o/r · main · abcdef0 · in sub')
    expect(text).toContain('Show notifications')
    expect(text).toContain('Nobody has reviewed this app.')
  })

  it('says so when it asks for nothing', async () => {
    post.mockResolvedValueOnce({
      data: inspection({ manifest: { ...inspection().manifest, capabilities: [] } }),
    })
    await check()
    expect(container.textContent).toContain('It asks for nothing beyond its own window.')
  })

  it('names an unknown capability as itself, even one that shares a name with an Object member', async () => {
    post.mockResolvedValueOnce({
      data: inspection({
        manifest: {
          ...inspection().manifest,
          icon: 'constructor',
          capabilities: ['toString', 'constructor', '<b>x</b>'],
        },
      }),
    })
    await check()
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(items).toEqual(['toString', 'constructor', '<b>x</b>'])
    // As text, never as markup.
    expect(container.querySelector('li b')).toBeNull()
    expect(container.textContent).toContain('Nobody has reviewed this app.')
  })

  it('disables Install at the installed commit', async () => {
    post.mockResolvedValueOnce({ data: inspection({ current: { commit: COMMIT } }) })
    await check()
    expect(container.textContent).toContain('Already installed at this commit.')
    expect(button('Install').disabled).toBe(true)
  })

  it('says it replaces an older install', async () => {
    post.mockResolvedValueOnce({
      data: inspection({ current: { commit: '1234567' + 'a'.repeat(33) } }),
    })
    await check()
    expect(container.textContent).toContain('Installed at 1234567. This replaces it.')
    expect(button('Install').disabled).toBe(false)
  })

  it('installs with the pending id', async () => {
    post.mockResolvedValueOnce({ data: inspection() }).mockResolvedValueOnce({ data: {} })
    await check()
    await act(async () => button('Install').click())
    expect(post).toHaveBeenLastCalledWith('/marketplace/url/install', { pending: 'p1' })
    expect(onInstalled).toHaveBeenCalled()
    expect(container.textContent).toContain('Installed.')
  })

  it('cancel deletes the pending inspection', async () => {
    post.mockResolvedValueOnce({ data: inspection() })
    del.mockResolvedValue({})
    await check()
    await act(async () => button('Cancel').click())
    expect(del).toHaveBeenCalledWith('/marketplace/url/pending/p1')
    expect(container.textContent).not.toContain('Nobody has reviewed')
  })

  it("shows the backend's message inline", async () => {
    post.mockRejectedValueOnce({ response: { data: { message: 'That is not a GitHub URL.' } } })
    await check('nope')
    expect(container.textContent).toContain('That is not a GitHub URL.')
  })

  it('falls back to a generic message on network errors', async () => {
    post.mockRejectedValueOnce(new Error('offline'))
    await check()
    expect(container.textContent).toContain("Couldn't reach that repository.")
  })
})
