// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getStatus, getIdentity, localSignIn } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getIdentity: vi.fn(),
  localSignIn: vi.fn(),
}))
vi.mock('./api/authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/authApi')>()),
  getStatus,
  getIdentity,
  localSignIn,
}))
// The desktop's settings round trip, which only the signed-in case reaches.
vi.mock('../../lib/prefs', () => ({
  flushPrefs: vi.fn(),
  flushPrefsKeepalive: vi.fn(),
  hydratePrefs: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../shared/store/dotfiles', () => ({
  rehydrateDotfileStores: vi.fn(() => Promise.resolve()),
}))

import { AuthGate } from './AuthGate'
import { useAuthStore } from './store/authStore'

/**
 * Which screen each session answer produces, before this tab has shown the
 * desktop. Driven with `react-dom/client` + `act`, like
 * `AppErrorBoundary.test.tsx`, rather than adding Testing Library.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SIGNED_OUT = { authenticated: false, session: null }
const CLAIMED = { setUp: true, setupTokenRequired: false }

let container: HTMLDivElement
let root: Root

async function renderWith(
  status: typeof SIGNED_OUT | Record<string, unknown>,
  identity: Record<string, unknown> = CLAIMED
): Promise<string> {
  getStatus.mockResolvedValue(status)
  getIdentity.mockResolvedValue(identity)
  await act(async () => {
    root.render(
      <AuthGate>
        <p>the desktop</p>
      </AuthGate>
    )
  })
  return container.textContent ?? ''
}

beforeEach(() => {
  useAuthStore.setState({
    ready: false,
    authenticated: false,
    session: null,
    locked: false,
    everAuthenticated: false,
    identity: null,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  getStatus.mockReset()
  getIdentity.mockReset()
})

describe('AuthGate', () => {
  it('shows the desktop for a live session', async () => {
    const text = await renderWith({
      ...SIGNED_OUT,
      authenticated: true,
      session: { subject: 'local-owner', username: 'gandolh' },
    })
    expect(text).toContain('the desktop')
  })

  // Brief 152: the signed-out screen is the machine's own.
  it('offers first-run setup on an unclaimed machine', async () => {
    const text = await renderWith(SIGNED_OUT, { setUp: false, setupTokenRequired: true })
    expect(text).toContain('Set up this machine')
    expect(text).toContain('Setup token')
    expect(text).not.toContain('the desktop')
  })

  it('asks for the password on a claimed machine, and signs in with it', async () => {
    const text = await renderWith(SIGNED_OUT)
    expect(text).toContain("Enter this machine's password")
    expect(text).not.toContain('the desktop')

    localSignIn.mockResolvedValue(undefined)
    getStatus.mockResolvedValue({
      ...SIGNED_OUT,
      authenticated: true,
      session: { subject: 'local-owner', username: 'Ana' },
    })
    const input = container.querySelector<HTMLInputElement>('#password')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'correct horse battery')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(localSignIn).toHaveBeenCalledWith('correct horse battery')
    expect(container.textContent).toContain('the desktop')
  })

  // Brief 157: the identity probe failing must not strand anybody.
  it('falls back to the sign-in form when the identity probe fails', async () => {
    getStatus.mockResolvedValue(SIGNED_OUT)
    getIdentity.mockRejectedValue(new Error('network'))
    await act(async () => {
      root.render(
        <AuthGate>
          <p>the desktop</p>
        </AuthGate>
      )
    })
    expect(container.textContent).toContain("Enter this machine's password")
  })
})
