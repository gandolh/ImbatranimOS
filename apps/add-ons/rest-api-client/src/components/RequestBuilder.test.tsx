// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RequestBuilder } from './RequestBuilder'
import type { FormField } from '../types'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Props = ComponentProps<typeof RequestBuilder>

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** A POST on the Body tab; the callbacks a test doesn't name are left out. */
function render(props: Partial<Props>) {
  const all = {
    method: 'POST',
    url: 'https://example.com',
    headers: [],
    body: '',
    bodyMode: 'file',
    form: [],
    filePath: '',
    tab: 'body',
    loading: false,
    environments: [],
    activeEnvId: null,
    previewUrl: 'https://example.com',
    issueText: null,
    sendBlocked: false,
    missingVars: [],
    ...props,
  } as unknown as Props
  act(() => root.render(<RequestBuilder {...all} />))
}

const chooser = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

async function click(b: HTMLButtonElement) {
  await act(async () => {
    b.click()
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('a file to send is picked, never typed', () => {
  it('the body file comes from the Open dialog, starting at the one chosen before', async () => {
    const onChooseFile = vi.fn(async () => 'Documents/payload.bin')
    const onFilePathChange = vi.fn()
    render({ filePath: 'Documents/old.bin', onChooseFile, onFilePathChange })

    expect(container.querySelector('input[placeholder="Documents/payload.bin"]')).toBeNull()
    expect(container.textContent).toContain('Documents/old.bin')
    await click(chooser('Choose the file to send'))
    expect(onChooseFile).toHaveBeenCalledWith('Documents/old.bin')
    expect(onFilePathChange).toHaveBeenCalledWith('Documents/payload.bin')
  })

  it('a cancelled pick keeps the file there was', async () => {
    const onFilePathChange = vi.fn()
    render({ onChooseFile: async () => null, onFilePathChange })
    expect(container.textContent).toContain('No file chosen')
    await click(chooser('Choose the file to send'))
    expect(onFilePathChange).not.toHaveBeenCalled()
  })

  it('a form field’s file is picked the same way', async () => {
    const field: FormField = { id: 'f1', enabled: true, name: 'photo', value: '', filePath: '' }
    const onFormChange = vi.fn()
    render({
      bodyMode: 'form',
      form: [field],
      onChooseFile: async () => 'Pictures/cat.png',
      onFormChange,
    })
    await click(chooser('Choose a file for photo'))
    expect(onFormChange).toHaveBeenCalledWith([{ ...field, filePath: 'Pictures/cat.png' }])
  })
})
