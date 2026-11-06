// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FileConflictError, SystemProvider, type SystemHandle } from '@imbatranim/ui'
import { RestApiClient } from './RestApiClient'

/**
 * A whole-file save must never replace collections the client failed to
 * read. `react-dom/client` plus `act`, as in apps/core; no testing library.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** What the data folder answers a read with: a doc, a failure, or null for no doc. */
type Answer = { content: string } | { error: unknown } | null

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  })

const saved = (id: string) => ({ id, name: id, method: 'GET', url: `https://${id}.test` })

let container: HTMLDivElement
let root: Root
let answers: Array<Answer | Promise<Answer>>
let write: ReturnType<typeof vi.fn>
let openApp: ReturnType<typeof vi.fn>
let notify: ReturnType<typeof vi.fn>
/** What the old doc's place answers. */
let legacy: { content: string } | { error: unknown }

function makeSystem(): SystemHandle {
  return {
    data: {
      read: async () => {
        const answer = await (answers.length > 0
          ? answers.shift()!
          : { error: new Error('no scripted answer') })
        if (answer === null) return null
        if ('error' in answer) throw answer.error
        return { content: answer.content, version: 'v-read' }
      },
      write,
    },
    http: {
      get: async () => {
        if ('error' in legacy) throw legacy.error
        return { data: { path: 'x', content: legacy.content }, status: 200, headers: {} }
      },
      delete: async () => ({ data: undefined, status: 204, headers: {} }),
      post: async () => ({
        data: {
          status: 200,
          statusText: 'PROXY_OK',
          headers: {},
          bodyBase64: btoa('ok'),
          truncated: false,
          elapsedMs: 3,
        },
        status: 200,
        headers: {},
      }),
    },
    notify,
    intents: { openApp },
    fs: { read: async () => new ArrayBuffer(0) },
  } as unknown as SystemHandle
}

async function mount() {
  await act(async () => {
    root.render(
      <SystemProvider system={makeSystem()}>
        <RestApiClient windowId="w1" />
      </SystemProvider>
    )
  })
}

/** Let the scripted promises settle and React commit. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

function typeUrl(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[placeholder^="https://"]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function button(match: (b: HTMLButtonElement) => boolean): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(match)
  if (!found) throw new Error('button not found')
  return found
}
const byText = (text: string) => button((b) => b.textContent?.trim() === text)
const saveButton = () => button((b) => b.title === 'Save to collection')

async function click(b: HTMLButtonElement) {
  await act(async () => {
    b.click()
  })
  await settle()
}

const writtenDoc = () => JSON.parse(write.mock.calls.at(-1)![1] as string)
const writtenOver = () => (write.mock.calls.at(-1)![2] as { expected: string | null }).expected

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  answers = []
  legacy = { error: httpError(404) }
  let n = 0
  write = vi.fn(async () => ({ version: `v-saved-${++n}` }))
  openApp = vi.fn(() => 'w2')
  notify = vi.fn()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('saved requests are never written over unread data', () => {
  it('a failed load shows why, and a Send does not save', async () => {
    answers.push({ error: httpError(503) })
    await mount()
    await settle()

    expect(container.textContent).toContain(
      'Saved requests are unavailable: the data folder answered 503'
    )
    typeUrl('https://example.test')
    await click(byText('Send'))
    expect(container.textContent).toContain('PROXY_OK')
    expect(write).not.toHaveBeenCalled()
  })

  it('Save while the load is still pending does not save', async () => {
    answers.push(new Promise<Answer>(() => {}))
    await mount()
    typeUrl('https://example.test')
    await click(saveButton())
    expect(write).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not saved' }))
  })

  it('after a successful Retry, Save writes the loaded collections plus the new one', async () => {
    answers.push({ error: httpError(401) })
    answers.push({ content: JSON.stringify({ collections: [saved('kept')] }) })
    await mount()
    await settle()
    await click(byText('Retry'))
    expect(container.textContent).not.toContain('Saved requests are unavailable')

    typeUrl('https://new.test')
    await click(saveButton())
    expect(write).toHaveBeenCalledTimes(1)
    expect(writtenDoc().collections.map((c: { url: string }) => c.url)).toEqual([
      'https://kept.test',
      'https://new.test',
    ])
    expect(writtenOver()).toBe('v-read')
  })

  it('malformed JSON is never overwritten, and Notepad is offered for the repair', async () => {
    answers.push({ content: '{ "collections": [ }' })
    await mount()
    await settle()

    expect(container.textContent).toContain('collections.json is not valid JSON')
    typeUrl('https://example.test')
    await click(byText('Send'))
    await click(saveButton())
    expect(write).not.toHaveBeenCalled()

    await click(byText('Open in Notepad'))
    expect(openApp).toHaveBeenCalledWith('notepad', {
      openPath: '.local/share/imbatranim/rest-api-client/collections.json',
      root: 'home',
    })
  })

  it('a malformed old doc is left where it was, and Notepad opens it there', async () => {
    answers.push(null)
    legacy = { content: '{ "collections": [ }' }
    await mount()
    await settle()

    expect(container.textContent).toContain('collections.json is not valid JSON')
    expect(write).not.toHaveBeenCalled()
    await click(byText('Open in Notepad'))
    expect(openApp).toHaveBeenCalledWith('notepad', {
      openPath: '.config/rest-client/collections.json',
      root: 'home',
    })
  })

  it('a first run starts empty and the first Save creates the file', async () => {
    answers.push(null)
    await mount()
    await settle()

    expect(container.textContent).not.toContain('Saved requests are unavailable')
    typeUrl('https://first.test')
    await click(saveButton())
    expect(write).toHaveBeenCalledTimes(1)
    expect(writtenDoc().collections.map((c: { url: string }) => c.url)).toEqual([
      'https://first.test',
    ])
    expect(writtenOver()).toBeNull()
  })

  it('the old doc moves in on the first load, and saves build on the moved one', async () => {
    answers.push(null)
    legacy = { content: JSON.stringify({ collections: [saved('kept')] }) }
    // The move reads its copy back before the original goes.
    answers.push({ content: legacy.content })
    await mount()
    await settle()

    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]).toEqual(['collections.json', legacy.content, { expected: null }])
    typeUrl('https://new.test')
    await click(saveButton())
    expect(writtenDoc().collections.map((c: { url: string }) => c.url)).toEqual([
      'https://kept.test',
      'https://new.test',
    ])
    expect(writtenOver()).toBe('v-saved-1')
  })
})

describe('two windows saving one doc', () => {
  it('each save builds on the version the one before left', async () => {
    answers.push({ content: JSON.stringify({ collections: [] }) })
    await mount()
    await settle()
    typeUrl('https://one.test')
    await click(saveButton())
    await click(byText('Send'))
    expect(write.mock.calls.map((c) => (c[2] as { expected: string }).expected)).toEqual([
      'v-read',
      'v-saved-1',
    ])
  })

  it('a save over a doc another window changed is refused, says so, and saves nothing more', async () => {
    answers.push({ content: JSON.stringify({ collections: [saved('mine')] }) })
    write.mockRejectedValueOnce(new FileConflictError('v-theirs'))
    await mount()
    await settle()

    typeUrl('https://late.test')
    await click(saveButton())
    expect(container.textContent).toContain('Saved requests changed in another window')
    expect(write).toHaveBeenCalledTimes(1)

    await click(byText('Send'))
    await click(saveButton())
    expect(write).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Not saved',
        body: 'Saved requests changed in another window. Reload them first.',
      })
    )

    answers.push({ content: JSON.stringify({ collections: [saved('theirs')] }) })
    await click(byText('Reload'))
    expect(container.textContent).not.toContain('changed in another window')
    await click(saveButton())
    expect(write).toHaveBeenCalledTimes(2)
    expect(writtenDoc().collections.map((c: { url: string }) => c.url)).toEqual([
      'https://theirs.test',
      'https://late.test',
    ])
  })
})
