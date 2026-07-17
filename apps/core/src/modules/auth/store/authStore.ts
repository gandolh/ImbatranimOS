import { create } from 'zustand'
import { getStatus } from '../api/authApi'

interface AuthState {
  /** True once the initial status probe has completed (avoids flash of lock). */
  ready: boolean
  authenticated: boolean
  needsSetup: boolean
  totpEnabled: boolean
  /** True when first-run setup must present the operator's SETUP_TOKEN. */
  setupTokenRequired: boolean
  /** Re-fetch auth status from the backend (source of truth). */
  refresh: () => Promise<void>
  /** Optimistically flip authentication (e.g. on a 401 => back to lock). */
  setAuthenticated: (value: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  authenticated: false,
  needsSetup: false,
  totpEnabled: false,
  setupTokenRequired: false,
  refresh: async () => {
    try {
      const status = await getStatus()
      set({
        ready: true,
        authenticated: status.authenticated,
        needsSetup: status.needsSetup,
        totpEnabled: status.totpEnabled,
        setupTokenRequired: status.setupTokenRequired,
      })
    } catch {
      // Backend unreachable: show the lock screen rather than the desktop.
      set({ ready: true, authenticated: false })
    }
  },
  setAuthenticated: (value) => set({ authenticated: value }),
}))
