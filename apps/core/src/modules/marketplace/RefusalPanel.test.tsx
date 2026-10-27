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
  it('opens Settings without the click reaching the window, which would raise it back over Settings', () => {
    const windowClick = vi.fn()
    act(() =>
      root.render(
        // Window.tsx raises its window on any click inside it.
        <div onClick={windowClick}>
          <RefusalPanel appName="Kit Notes" reason="Kit Notes needs system protocol 9." />
        </div>
      )
    )
    expect(container.textContent).toContain("Can't open Kit Notes")
    expect(container.textContent).toContain('Kit Notes needs system protocol 9.')

    const button = container.querySelector('button')!
    expect(button.textContent).toBe('Open Settings')
    act(() => button.click())
    expect(openApp).toHaveBeenCalledExactlyOnceWith('settings')
    expect(windowClick).not.toHaveBeenCalled()
  })
})
