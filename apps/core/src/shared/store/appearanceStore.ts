import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { prefsStorage } from "../../lib/prefs";

/** The set of values the desktop is drawn with. Two ship; Apricot is the default. */
export type ThemeId = "apricot" | "classic";
/** Light or dark, chosen inside a theme. */
export type Mode = "light" | "dark";
/**
 * What the user chose for the mode. `system` follows the device's colour
 * scheme; what is painted is always a `Mode`, never `system`.
 */
export type ModePreference = Mode | "system";

export const MODE_PREFERENCES: readonly ModePreference[] = ["light", "dark", "system"];

export const THEME_IDS: readonly ThemeId[] = ["apricot", "classic"];

/**
 * One accent's colours in one mode. `strong` feeds `primary` (text, focus
 * rings, borders, primary actions) with `strongOn` on it; `soft` feeds
 * `primary-container` (selected and current things) with `softOn` on it.
 */
export type AccentColours = { strong: string; strongOn: string; soft: string; softOn: string };

export type AccentPreset = {
  id: string;
  name: string;
  light: AccentColours;
  dark: AccentColours;
};

/** Classic's accents are one fill with white on it, in every slot and both modes. */
function classic(id: string, name: string, hex: string): AccentPreset {
  const colours = { strong: hex, strongOn: "#ffffff", soft: hex, softOn: "#ffffff" };
  return { id, name, light: colours, dark: colours };
}

const APRICOT_ON = "#33241b";

/**
 * Apricot's accents are pastels, which only pass with dark text on them. In
 * light mode `strong` is a deep shade of the same hue with white on it, so
 * every text, ring and border use of `primary` stays readable on cream; in
 * dark mode the pastel itself reads on the dark surfaces.
 */
function apricot(id: string, name: string, pastel: string, deep: string): AccentPreset {
  const soft = { soft: pastel, softOn: APRICOT_ON };
  return {
    id,
    name,
    light: { strong: deep, strongOn: "#ffffff", ...soft },
    dark: { strong: pastel, strongOn: APRICOT_ON, ...soft },
  };
}

/**
 * Each theme's accents.
 *
 * Classic: white on each fill clears 4.5:1 —
 *   crimson #c0263a ~5.9  ·  cobalt #1f5fd6 ~5.7  ·  emerald #0f7a40 ~5.4  ·  signal #d24317 ~4.6
 * Apricot: the pastels from the 2026-11-02 canvas. The deep shades keep each
 * pastel's hue, take the canvas's own deep apricot (#a84f25) as the model, and
 * are as light as they can be while clearing 4.5:1 as text on every surface up
 * to `high` and under white text. The canvas's #a84f25 itself reaches only
 * 4.3:1 on `high`, hence #a04b23. contrast.test.ts holds them to it.
 */
export const ACCENT_PRESETS: Record<ThemeId, AccentPreset[]> = {
  apricot: [
    apricot("apricot", "Apricot", "#f2a97e", "#a04b23"),
    apricot("rose", "Rose", "#eea6b5", "#b23656"),
    apricot("butter", "Butter", "#f3d27a", "#7f5f1b"),
    apricot("sage", "Sage", "#a9c9a4", "#4e6c48"),
    apricot("sky", "Sky", "#a7c7e7", "#376891"),
  ],
  classic: [
    classic("crimson", "Crimson", "#c0263a"),
    classic("cobalt", "Cobalt", "#1f5fd6"),
    classic("emerald", "Emerald", "#0f7a40"),
    classic("signal", "Signal Orange", "#d24317"),
  ],
};

export const DEFAULT_THEME: ThemeId = "apricot";
export const DEFAULT_MODE: Mode = "light";
export const DEFAULT_MODE_PREFERENCE: ModePreference = "light";
export const DEFAULT_ACCENTS: Record<ThemeId, string> = { apricot: "apricot", classic: "crimson" };

/**
 * What is saved: the theme, the mode preference and the mode it last resolved
 * to, and the accent chosen in each theme. `mode` is what is painted.
 */
export type AppearanceState = {
  theme: ThemeId;
  mode: Mode;
  modePreference: ModePreference;
  accents: Record<ThemeId, string>;
};

/** What painting needs. */
export type Painted = Pick<AppearanceState, "theme" | "mode" | "accents">;

type AppearanceStore = AppearanceState & {
  setTheme: (t: ThemeId) => void;
  /** Chooses Light or Dark explicitly. */
  setMode: (m: Mode) => void;
  /** Chooses Light, Dark or System; System resolves through the device's colour scheme. */
  setModePreference: (p: ModePreference) => void;
  /** Sets the accent of the current theme. */
  setAccent: (id: string) => void;
};

function isThemeId(v: unknown): v is ThemeId {
  return v === "apricot" || v === "classic";
}

function isMode(v: unknown): v is Mode {
  return v === "light" || v === "dark";
}

function isModePreference(v: unknown): v is ModePreference {
  return v === "light" || v === "dark" || v === "system";
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The mode a preference paints right now. System reads the device; with no way to ask, it is light. */
export function resolveMode(preference: ModePreference): Mode {
  if (preference !== "system") return preference;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return DEFAULT_MODE;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Keeps `mode` in step with the device while System is chosen. Returns the
 * function that stops watching. Called once, by the app shell.
 */
export function watchSystemMode(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    const { modePreference, mode, setModePreference } = useAppearanceStore.getState();
    if (modePreference === "system" && resolveMode("system") !== mode) setModePreference("system");
  };
  // The device may have changed since the blob was read.
  onChange();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isAccentOf(theme: ThemeId, id: unknown): id is string {
  return ACCENT_PRESETS[theme].some((p) => p.id === id);
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
  const s = (saved ?? {}) as Record<string, unknown>;
  if (isMode(s.theme)) {
    return {
      theme: DEFAULT_THEME,
      mode: DEFAULT_MODE,
      modePreference: DEFAULT_MODE_PREFERENCE,
      accents: {
        ...DEFAULT_ACCENTS,
        classic: isAccentOf("classic", s.accent) ? s.accent : DEFAULT_ACCENTS.classic,
      },
    };
  }
  const accents = (s.accents ?? {}) as Record<string, unknown>;
  // A blob from before System existed has no preference: its mode is the choice.
  const savedMode = isMode(s.mode) ? s.mode : DEFAULT_MODE;
  const modePreference = isModePreference(s.modePreference) ? s.modePreference : savedMode;
  return {
    theme: isThemeId(s.theme) ? s.theme : DEFAULT_THEME,
    mode: resolveMode(modePreference),
    modePreference,
    accents: {
      apricot: isAccentOf("apricot", accents.apricot) ? accents.apricot : DEFAULT_ACCENTS.apricot,
      classic: isAccentOf("classic", accents.classic) ? accents.classic : DEFAULT_ACCENTS.classic,
    },
  };
}

/** The current theme's chosen accent, or its first preset if the saved id is gone. */
export function currentAccent(state: Pick<AppearanceState, "theme" | "accents">): AccentPreset {
  const presets = ACCENT_PRESETS[state.theme];
  return presets.find((p) => p.id === state.accents[state.theme]) ?? presets[0];
}

/** The current accent's colours in the current mode. */
export function accentColours(state: Painted): AccentColours {
  return currentAccent(state)[state.mode];
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      mode: DEFAULT_MODE,
      modePreference: DEFAULT_MODE_PREFERENCE,
      accents: DEFAULT_ACCENTS,
      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode, modePreference: mode }),
      setModePreference: (modePreference) => set({ modePreference, mode: resolveMode(modePreference) }),
      setAccent: (id) => set((s) => (isAccentOf(s.theme, id) ? { accents: { ...s.accents, [s.theme]: id } } : s)),
    }),
    {
      name: "imbatranimos:appearance",
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
      merge: (saved, current) => (saved === undefined ? current : { ...current, ...readAppearance(saved) }),
      partialize: ({ theme, mode, modePreference, accents }) => ({ theme, mode, modePreference, accents }),
    },
  ),
);

/**
 * Push the theme, mode and accent onto the document root so the CSS vars
 * resolve: both accent pairs, strong and soft. `data-theme` keeps its name (the token blocks, the Terminal and the
 * docs site read it) and carries the mode, only ever `light` or `dark`, never
 * the System preference; `data-os-theme` carries the theme.
 */
export function applyAppearance(state: Painted): void {
  const accent = accentColours(state);
  const root = document.documentElement;
  root.setAttribute("data-os-theme", state.theme);
  root.setAttribute("data-theme", state.mode);
  root.style.setProperty("--accent", accent.strong);
  root.style.setProperty("--accent-on", accent.strongOn);
  root.style.setProperty("--accent-soft", accent.soft);
  root.style.setProperty("--accent-soft-on", accent.softOn);
}
