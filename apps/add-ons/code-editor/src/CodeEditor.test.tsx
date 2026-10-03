// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  FileConflictError,
  resetOpenedFilesForTest,
  SystemProvider,
  type SystemHandle,
} from '@imbatranim/ui'

/**
 * Brief 155: a save over a file that changed on disk since it was opened asks
 * Overwrite / Reload from disk / Cancel instead of destroying the change.
 *
 * Monaco cannot run in jsdom, so `@monaco-editor/react` is replaced by a fake
 * that mounts an editor and models with just the members the app calls.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Element.prototype.getAnimations ??= () => []

class FakeModel {
  private alt = 1
  private listeners = new Set<() => void>()
  private value: string
  constructor(value: string) {
    this.value = value
  }
  getValue() {
    return this.value
  }
  getAlternativeVersionId() {
    return this.alt
  }
  getLineCount() {
    return this.value.split('\n').length
  }
  getFullModelRange() {
    return {}
  }
  pushEditOperations(_before: unknown, ops: { text: string }[]) {
    this.edit(ops[0].text)
    return null
  }
  /** What a keystroke does: new text, a new version, a change event. */
  edit(text: string) {
    this.value = text
    this.alt++
    this.listeners.forEach((l) => l())
  }
  onDidChangeContent(cb: () => void) {
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }
  dispose() {}
}

const models: FakeModel[] = []

vi.mock('./monacoSetup', () => ({}))
vi.mock('@monaco-editor/react', () => ({
  default: function FakeEditor({ onMount }: { onMount: (e: unknown, m: unknown) => void }) {
    useEffect(() => {
      let model: FakeModel | null = null
      const editor = {
        getModel: () => model,
        setModel: (next: FakeModel | null) => (model = next),
        saveViewState: () => null,
        restoreViewState: () => {},
        revealLineInCenter: () => {},
        setPosition: () => {},
        focus: () => {},
        getAction: () => null,
      }
      const monaco = {
        Uri: { parse: (s: string) => s },
        editor: {
          createModel: (value: string) => {
            const created = new FakeModel(value)
            models.push(created)
            return created
          },
        },
      }
      onMount(editor, monaco)
    }, [onMount])
    return null
  },
}))

const { CodeEditor } = await import('./CodeEditor')

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
    },
    intents: {
      onIntent: (cb: (payload: unknown) => void) => {
        cb({ root: 'home', openPath: 'src/app.ts' })
        return () => undefined
      },
    },
    notify: vi.fn(),
    window: {
      setTitle: vi.fn(),
      onCloseRequest: () => () => undefined,
      isFocused: () => true,
    },
    appearance: { get: () => ({ theme: 'dark', accent: 'blue' }) },
    shortcuts: { register: () => () => undefined, document: () => () => undefined },
    on: () => () => undefined,
  } as unknown as SystemHandle
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)))

async function mount() {
  await act(async () => {
    root.render(
      <SystemProvider system={makeSystem()}>
        <CodeEditor windowId="w1" />
      </SystemProvider>
    )
  })
  await settle()
  await settle()
}

const model = () => models.at(-1)!

function type(text: string) {
  act(() => model().edit(text))
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
  type('const mine = 1')
  disk = { content: 'const theirs = 2', version: 'v2' }
  upload.mockRejectedValueOnce(new FileConflictError('v2'))
  await click('Save')
}

beforeEach(() => {
  sessionStorage.clear()
  resetOpenedFilesForTest()
  models.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  disk = { content: 'const theirs = 1', version: 'v1' }
  upload = vi.fn(async (_root: string, _path: string, bytes: Uint8Array) => ({
    version: `saved-${decoder.decode(bytes)}`,
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('a save over a file that changed on disk (brief 155)', () => {
  it('sends the version it read, and asks on a conflict', async () => {
    await saveOverExternalChange()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(uploaded(0)).toEqual({ text: 'const mine = 1', expected: 'v1' })
    expect(dialogOpen()).toBe(true)
  })

  it('Overwrite writes mine without a precondition', async () => {
    await saveOverExternalChange()
    await click('Overwrite')
    expect(upload).toHaveBeenCalledTimes(2)
    expect(uploaded(1)).toEqual({ text: 'const mine = 1', expected: undefined })
    expect(dialogOpen()).toBe(false)
    expect(button('Save').disabled).toBe(true)
  })

  it('Reload from disk discards mine as an undoable edit', async () => {
    await saveOverExternalChange()
    await click('Reload from disk')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(model().getValue()).toBe('const theirs = 2')
    expect(button('Save').disabled).toBe(true)

    type('const theirs = 3')
    await click('Save')
    expect(uploaded(1).expected).toBe('v2')
  })

  it('Cancel writes nothing and keeps my text', async () => {
    await saveOverExternalChange()
    await click('Cancel')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(dialogOpen()).toBe(false)
    expect(model().getValue()).toBe('const mine = 1')
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
