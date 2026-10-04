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
 * Brief 137 — which screen each session answer produces, before this tab has
 * shown the desktop. Driven with `react-dom/client` + `act`, like
 * `AppErrorBoundary.test.tsx`, rather than adding Testing Library.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SIGNED_OUT = { authenticated: false, session: null, unavailable: false, forbidden: false }

let container: HTMLDivElement
let root: Root

const WARD = { mode: 'ward' }

async function renderWith(
  status: typeof SIGNED_OUT | Record<string, unknown>,
  identity: Record<string, unknown> = WARD
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
    unavailable: false,
    forbidden: false,
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
})

describe('AuthGate', () => {
  it('shows the desktop for a granted session', async () => {
    const text = await renderWith({
      ...SIGNED_OUT,
      authenticated: true,
      session: { subject: 's1', username: 'gandolh' },
    })
    expect(text).toContain('the desktop')
  })

  it('offers the sign-in hand-off when signed out', async () => {
    const text = await renderWith(SIGNED_OUT)
    expect(text).toContain('Continue to sign in')
    expect(text).not.toContain('the desktop')
  })

  it('shows the no-access screen, not the sign-in hand-off, for a session without a grant', async () => {
    const text = await renderWith({ ...SIGNED_OUT, forbidden: true })
    expect(text).toContain('No access')
    expect(text).not.toContain('Continue to sign in')
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/ward/account')
  })

  it('shows the unavailable screen, not the sign-in hand-off, when Ward is down', async () => {
    const text = await renderWith({ ...SIGNED_OUT, unavailable: true })
    expect(text).toContain('Sign-in unavailable')
    expect(text).not.toContain('Continue to sign in')
  })

  // Brief 152: without Ward, the signed-out screen is the machine's own.
  it('offers first-run setup on an unclaimed machine without Ward', async () => {
    const text = await renderWith(SIGNED_OUT, {
      mode: 'local',
      local: { setUp: false, setupTokenRequired: true },
    })
    expect(text).toContain('Set up this machine')
    expect(text).toContain('Setup token')
    expect(text).not.toContain('Continue to sign in')
  })

  it('asks for the password on a claimed machine without Ward, and signs in with it', async () => {
    const text = await renderWith(SIGNED_OUT, {
      mode: 'local',
      local: { setUp: true, setupTokenRequired: false },
    })
    expect(text).toContain("Enter this machine's password")

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
})
