// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  FileConflictError,
  resetOpenedFilesForTest,
  SystemProvider,
  type SystemHandle,
} from '@imbatranim/ui'
import { MarkdownEditor } from './MarkdownEditor'

/**
 * Brief 155: a save over a file that changed on disk since it was opened asks
 * Overwrite / Reload from disk / Cancel instead of destroying the change.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no Web Animations; the kit's ScrollArea asks for them on a timer.
Element.prototype.getAnimations ??= () => []

const encoder = new TextEncoder()
const decoder = new TextDecoder()

type Disk = { content: string; version: string }

let container: HTMLDivElement
let root: Root
let disk: Disk
let upload: ReturnType<typeof vi.fn>

function makeSystem(): SystemHandle {
  return {
    windowId: 'w1',
    fs: {
      readWithVersion: async () => ({
        bytes: encoder.encode(disk.content).buffer,
        version: disk.version,
      }),
      upload,
      downloadUrl: () => '',
    },
    intents: {
      onIntent: (cb: (payload: unknown) => void) => {
        cb({ root: 'home', openPath: 'README.md' })
        return () => undefined
      },
    },
    notify: vi.fn(),
    window: {
      setTitle: vi.fn(),
      onCloseRequest: () => () => undefined,
      isFocused: () => true,
    },
    on: () => () => undefined,
  } as unknown as SystemHandle
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function mount() {
  await act(async () => {
    root.render(
      <SystemProvider system={makeSystem()}>
        <MarkdownEditor windowId="w1" />
      </SystemProvider>
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
const uploaded = (call: number) => {
  const [, , bytes, , opts] = upload.mock.calls[call] as [
    string,
    string,
    Uint8Array,
    string,
    { expected?: string },
  ]
  return { text: decoder.decode(bytes), expected: opts?.expected }
}

async function saveOverExternalChange() {
  await mount()
  type('# mine')
  disk = { content: '# theirs\nterminal', version: 'v2' }
  upload.mockRejectedValueOnce(new FileConflictError('v2'))
  await click('Save')
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  resetOpenedFilesForTest()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  disk = { content: '# theirs', version: 'v1' }
  upload = vi.fn(async (_root: string, _path: string, bytes: Uint8Array) => ({
    version: `saved-${decoder.decode(bytes)}`,
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('a save over a file that changed on disk (brief 155)', () => {
  it('sends the version it read, and asks on a conflict', async () => {
    await saveOverExternalChange()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(uploaded(0)).toEqual({ text: '# mine', expected: 'v1' })
    expect(dialogOpen()).toBe(true)
  })

  it('Overwrite writes mine without a precondition', async () => {
    await saveOverExternalChange()
    await click('Overwrite')
    expect(upload).toHaveBeenCalledTimes(2)
    expect(uploaded(1)).toEqual({ text: '# mine', expected: undefined })
    expect(dialogOpen()).toBe(false)
    expect(button('Save').disabled).toBe(true)
  })

  it('Reload from disk discards mine and shows the file as it is now', async () => {
    await saveOverExternalChange()
    await click('Reload from disk')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(textarea().value).toBe('# theirs\nterminal')
    expect(button('Save').disabled).toBe(true)

    type('# theirs\nterminal\nmine')
    await click('Save')
    expect(uploaded(1).expected).toBe('v2')
  })

  it('Cancel writes nothing and keeps my text', async () => {
    await saveOverExternalChange()
    await click('Cancel')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(dialogOpen()).toBe(false)
    expect(textarea().value).toBe('# mine')
    expect(button('Save').disabled).toBe(false)
  })

  it('a save after a save sends the version the first one wrote', async () => {
    await mount()
    type('one')
    await click('Save')
    type('two')
    await click('Save')
    expect(uploaded(1)).toEqual({ text: 'two', expected: 'saved-one' })
  })
})
