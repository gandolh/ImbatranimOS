// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SystemProvider, type SystemHandle } from '@imbatranim/ui'
import { RestApiClient } from './RestApiClient'

/**
 * Brief 139: a whole-file save must never replace collections the client failed to
 * read. `react-dom/client` plus `act`, as in apps/core; no testing library.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Answer = { content: string } | { error: unknown }

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  })

const saved = (id: string) => ({ id, name: id, method: 'GET', url: `https://${id}.test` })

let container: HTMLDivElement
let root: Root
let answers: Array<Answer | Promise<Answer>>
let put: ReturnType<typeof vi.fn>
let openApp: ReturnType<typeof vi.fn>
let notify: ReturnType<typeof vi.fn>

function makeSystem(): SystemHandle {
  return {
    http: {
      get: async () => {
        const answer = await (answers.shift() ?? { error: new Error('no scripted answer') })
        if ('error' in answer) throw answer.error
        return { data: { path: 'x', content: answer.content }, status: 200, headers: {} }
      },
      put,
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

const writtenDoc = () => JSON.parse((put.mock.calls.at(-1)![1] as { content: string }).content)

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  answers = []
  put = vi.fn(async () => ({ data: {}, status: 200, headers: {} }))
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
      'Saved requests are unavailable: the files service answered 503'
    )
    typeUrl('https://example.test')
    await click(byText('Send'))
    expect(container.textContent).toContain('PROXY_OK')
    expect(put).not.toHaveBeenCalled()
  })

  it('Save while the load is still pending does not save', async () => {
    answers.push(new Promise<Answer>(() => {}))
    await mount()
    typeUrl('https://example.test')
    await click(saveButton())
    expect(put).not.toHaveBeenCalled()
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
    expect(put).toHaveBeenCalledTimes(1)
    expect(writtenDoc().collections.map((c: { url: string }) => c.url)).toEqual([
      'https://kept.test',
      'https://new.test',
    ])
  })

  it('malformed JSON is never overwritten, and Notepad is offered for the repair', async () => {
    answers.push({ content: '{ "collections": [ }' })
    await mount()
    await settle()

    expect(container.textContent).toContain('collections.json is not valid JSON')
    typeUrl('https://example.test')
    await click(byText('Send'))
    await click(saveButton())
    expect(put).not.toHaveBeenCalled()

    await click(byText('Open in Notepad'))
    expect(openApp).toHaveBeenCalledWith('notepad', {
      openPath: '.config/rest-client/collections.json',
      root: 'home',
    })
  })

  it('a first run (404) starts empty and the first Save creates the file', async () => {
    answers.push({ error: httpError(404) })
    await mount()
    await settle()

    expect(container.textContent).not.toContain('Saved requests are unavailable')
    typeUrl('https://first.test')
    await click(saveButton())
    expect(put).toHaveBeenCalledTimes(1)
    expect(writtenDoc().collections.map((c: { url: string }) => c.url)).toEqual([
      'https://first.test',
    ])
  })
})
