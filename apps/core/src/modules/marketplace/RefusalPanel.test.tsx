// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { openApp } = vi.hoisted(() => ({ openApp: vi.fn() }))
vi.mock('../../shared/intents/openApp', () => ({ openApp }))

import { RefusalPanel } from './RefusalPanel'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Brief 175: the window of an app that cannot run here says so, and points to Settings. */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  openApp.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('RefusalPanel', () => {
  // Settings staying in front of this window is Window.tsx's job since brief
  // 179 (Window.test.tsx), so the click is free to bubble.
  it('names the app and the reason, and opens Settings', () => {
    act(() =>
      root.render(<RefusalPanel appName="Kit Notes" reason="Kit Notes needs system protocol 9." />)
    )
    expect(container.textContent).toContain("Can't open Kit Notes")
    expect(container.textContent).toContain('Kit Notes needs system protocol 9.')

    const button = container.querySelector('button')!
    expect(button.textContent).toBe('Open Settings')
    act(() => button.click())
    expect(openApp).toHaveBeenCalledExactlyOnceWith('settings')
  })
})
