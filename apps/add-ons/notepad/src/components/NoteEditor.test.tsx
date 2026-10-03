// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient, SystemProvider, type SystemHandle } from '@imbatranim/ui'
import { NoteEditor } from './NoteEditor'

/**
 * Brief 155: a save over a file that changed on disk since it was opened asks
 * Overwrite / Reload from disk / Cancel instead of destroying the change.
 * `react-dom/client` plus `act`, as in apps/core; no testing library.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Disk = { content: string; version: string }

let container: HTMLDivElement
let root: Root
let disk: Disk
let put: ReturnType<typeof vi.fn>

const conflict = (current: string) =>
  Object.assign(new Error('Request failed with status code 409'), {
    response: { status: 409, data: { statusCode: 409, current } },
  })

function makeSystem(): SystemHandle {
  return {
    http: {
      get: async () => ({
        data: { path: 'notes.txt', ...disk },
        status: 200,
        headers: {},
      }),
      put,
    },
    notify: vi.fn(),
    window: {
      setTitle: vi.fn(),
      onCloseRequest: () => () => undefined,
      isFocused: () => true,
    },
  } as unknown as SystemHandle
}

/** Let the scripted promises settle and React commit. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function mount() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <SystemProvider system={makeSystem()}>
          <NoteEditor windowId="w1" doc={{ root: 'home', path: 'notes.txt' }} onBack={() => {}} />
        </SystemProvider>
      </QueryClientProvider>
    )
  })
  await settle()
}

const textarea = () => container.querySelector('textarea')!

function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(textarea(), value)
    textarea().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Buttons anywhere in the document: the dialog renders in a portal. */
function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
  if (!found) throw new Error(`button "${text}" not found`)
  return found
}

async function click(text: string) {
  await act(async () => {
    button(text).click()
  })
  await settle()
}

/** The conflict question is up (a closing dialog lingers for its exit animation). */
const dialogOpen = () =>
  [...document.querySelectorAll('[role="dialog"]:not([data-closed])')].some((d) =>
    d.textContent!.includes('changed on disk since you opened it')
  )

/** Open v1, type, and let the Terminal append a line before Save. */
async function saveOverExternalChange() {
  await mount()
  type('mine')
  disk = { content: 'theirs\nterminal', version: 'v2' }
  put.mockRejectedValueOnce(conflict('v2'))
  await click('Save')
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  disk = { content: 'theirs', version: 'v1' }
  put = vi.fn(async (_url: string, body: { content: string }) => ({
    data: { path: 'notes.txt', version: `saved-${body.content}` },
    status: 200,
    headers: {},
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  queryClient.clear()
})

describe('a save over a file that changed on disk (brief 155)', () => {
  it('sends the version it read, and asks on a 409', async () => {
    await saveOverExternalChange()
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0][1]).toMatchObject({ content: 'mine', expected: 'v1' })
    expect(dialogOpen()).toBe(true)
  })

  it('Overwrite writes mine without a precondition', async () => {
    await saveOverExternalChange()
    await click('Overwrite')
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][1]).toMatchObject({ content: 'mine', expected: undefined })
    expect(dialogOpen()).toBe(false)
    expect(textarea().value).toBe('mine')
    expect(button('Save').disabled).toBe(true)
  })

  it('Reload from disk discards mine and shows the file as it is now', async () => {
    await saveOverExternalChange()
    await click('Reload from disk')
    expect(put).toHaveBeenCalledTimes(1)
    expect(textarea().value).toBe('theirs\nterminal')
    expect(button('Save').disabled).toBe(true)

    // The next save builds on the version just reloaded.
    type('theirs\nterminal\nmine')
    await click('Save')
    expect(put.mock.calls[1][1]).toMatchObject({ expected: 'v2' })
  })

  it('Cancel writes nothing and keeps my text', async () => {
    await saveOverExternalChange()
    await click('Cancel')
    expect(put).toHaveBeenCalledTimes(1)
    expect(dialogOpen()).toBe(false)
    expect(textarea().value).toBe('mine')
    expect(button('Save').disabled).toBe(false)
  })

  it('a save after a save sends the version the first one wrote', async () => {
    await mount()
    type('one')
    await click('Save')
    type('two')
    await click('Save')
    expect(put.mock.calls[1][1]).toMatchObject({ content: 'two', expected: 'saved-one' })
  })
})
