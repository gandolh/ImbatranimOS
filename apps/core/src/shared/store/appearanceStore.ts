import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { prefsStorage } from '../../lib/prefs'

/** The set of values the desktop is drawn with. Two ship; Apricot is the default. */
export type ThemeId = 'apricot' | 'classic'
/** Light or dark, chosen inside a theme. */
export type Mode = 'light' | 'dark'

export const THEME_IDS: readonly ThemeId[] = ['apricot', 'classic']

export type AccentPreset = {
  id: string
  name: string
  /** Accent fill. */
  hex: string
  /** Text/icon color to sit on the accent fill. */
  on: string
}

/**
 * Each theme's accents.
 *
 * Classic: white on each fill clears 4.5:1 —
 *   crimson #c0263a ~6.5  ·  cobalt #1f5fd6 ~5.8  ·  emerald #0f7a40 ~5.5  ·  signal #d24317 ~4.6
 * Apricot: pastels from the 2026-11-02 canvas, which only pass with dark text on them.
 */
export const ACCENT_PRESETS: Record<ThemeId, AccentPreset[]> = {
  apricot: [
    { id: 'apricot', name: 'Apricot', hex: '#f2a97e', on: '#33241b' },
    { id: 'rose', name: 'Rose', hex: '#eea6b5', on: '#33241b' },
    { id: 'butter', name: 'Butter', hex: '#f3d27a', on: '#33241b' },
    { id: 'sage', name: 'Sage', hex: '#a9c9a4', on: '#33241b' },
    { id: 'sky', name: 'Sky', hex: '#a7c7e7', on: '#33241b' },
  ],
  classic: [
    { id: 'crimson', name: 'Crimson', hex: '#c0263a', on: '#ffffff' },
    { id: 'cobalt', name: 'Cobalt', hex: '#1f5fd6', on: '#ffffff' },
    { id: 'emerald', name: 'Emerald', hex: '#0f7a40', on: '#ffffff' },
    { id: 'signal', name: 'Signal Orange', hex: '#d24317', on: '#ffffff' },
  ],
}

export const DEFAULT_THEME: ThemeId = 'apricot'
export const DEFAULT_MODE: Mode = 'light'
export const DEFAULT_ACCENTS: Record<ThemeId, string> = { apricot: 'apricot', classic: 'crimson' }

/** What is saved and painted: the theme, the mode, and the accent chosen in each theme. */
export type AppearanceState = {
  theme: ThemeId
  mode: Mode
  accents: Record<ThemeId, string>
}

type AppearanceStore = AppearanceState & {
  setTheme: (t: ThemeId) => void
  setMode: (m: Mode) => void
  /** Sets the accent of the current theme. */
  setAccent: (id: string) => void
}

function isThemeId(v: unknown): v is ThemeId {
  return v === 'apricot' || v === 'classic'
}

function isMode(v: unknown): v is Mode {
  return v === 'light' || v === 'dark'
}

function isAccentOf(theme: ThemeId, id: unknown): id is string {
  return ACCENT_PRESETS[theme].some((p) => p.id === id)
}

/**
 * Read a saved appearance blob of any age.
 *
 * Before themes existed the blob was `{ theme: 'dark' | 'light', accent }`, its
 * `theme` meaning the mode. Such a machine moves to Apricot light once
 * (decisions-themes.md, 2026-11-02), keeping its old accent as Classic's.
 * Anything unreadable falls back to the defaults, per field.
 */
export function readAppearance(saved: unknown): AppearanceState {
  const s = (saved ?? {}) as Record<string, unknown>
  if (isMode(s.theme)) {
    return {
      theme: DEFAULT_THEME,
      mode: DEFAULT_MODE,
      accents: {
        ...DEFAULT_ACCENTS,
        classic: isAccentOf('classic', s.accent) ? s.accent : DEFAULT_ACCENTS.classic,
      },
    }
  }
  const accents = (s.accents ?? {}) as Record<string, unknown>
  return {
    theme: isThemeId(s.theme) ? s.theme : DEFAULT_THEME,
    mode: isMode(s.mode) ? s.mode : DEFAULT_MODE,
    accents: {
      apricot: isAccentOf('apricot', accents.apricot) ? accents.apricot : DEFAULT_ACCENTS.apricot,
      classic: isAccentOf('classic', accents.classic) ? accents.classic : DEFAULT_ACCENTS.classic,
    },
  }
}

/** The current theme's chosen accent, or its first preset if the saved id is gone. */
export function currentAccent(state: AppearanceState): AccentPreset {
  const presets = ACCENT_PRESETS[state.theme]
  return presets.find((p) => p.id === state.accents[state.theme]) ?? presets[0]
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      mode: DEFAULT_MODE,
      accents: DEFAULT_ACCENTS,
      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode }),
      setAccent: (id) =>
        set((s) => (isAccentOf(s.theme, id) ? { accents: { ...s.accents, [s.theme]: id } } : s)),
    }),
    {
      name: 'imbatranimos:appearance',
      /**
       * Server-backed dotfile: durable user config that belongs to the
       * account, not to one browser. `prefsStorage` mirrors to localStorage for
       * the pre-auth first paint and writes through to `/api/prefs`.
       */
      storage: createJSONStorage(() => prefsStorage),
      // Version 0 is the blob from before themes; persist writes the migrated
      // shape back once, and a version-1 blob is not migrated again.
      version: 1,
      migrate: (saved) => readAppearance(saved),
      // Also covers a blob with no version at all, which persist hands over
      // without calling migrate. Nothing saved keeps what is in memory.
      merge: (saved, current) =>
        saved === undefined ? current : { ...current, ...readAppearance(saved) },
      partialize: ({ theme, mode, accents }) => ({ theme, mode, accents }),
    }
  )
)

/**
 * Push the theme, mode and accent onto the document root so the CSS vars
 * resolve. `data-theme` keeps its name (the token blocks, the Terminal and the
 * docs site read it) and carries the mode; `data-os-theme` carries the theme.
 */
export function applyAppearance(state: AppearanceState): void {
  const preset = currentAccent(state)
  const root = document.documentElement
  root.setAttribute('data-os-theme', state.theme)
  root.setAttribute('data-theme', state.mode)
  root.style.setProperty('--accent', preset.hex)
  root.style.setProperty('--accent-on', preset.on)
}
