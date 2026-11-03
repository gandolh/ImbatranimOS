import type * as monaco from 'monaco-editor'

/**
 * A Monaco theme drawn from the desktop's design tokens, so the editor sits on
 * the window's own surface in either theme (Apricot or Classic) and mode.
 *
 * Only the editor's chrome comes from the tokens: background, text, gutter,
 * current line, selection, cursor and the widgets. Syntax colours are left to
 * Monaco's own `vs` / `vs-dark` (`inherit: true`), which are tuned for light
 * and dark grounds and stay readable on these surfaces.
 */

/** Resolves a CSS custom property name (with the leading `--`) to its value. */
export type VarResolver = (name: string) => string

export const OS_MONACO_THEME = 'imbatranim-os'

/** `#rrggbb` from a token, or null if it isn't one (not resolved yet). */
function hex(resolve: VarResolver, name: string): string | null {
  const v = resolve(name).trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(v) ? v : null
}

/**
 * Build the theme for a mode. Takes a resolver rather than reading the DOM so
 * the mapping is testable without one. Colours whose token doesn't resolve are
 * left to the base theme.
 */
export function buildMonacoTheme(
  mode: 'light' | 'dark',
  resolve: VarResolver
): monaco.editor.IStandaloneThemeData {
  const surface = hex(resolve, '--k-surface-container-lowest')
  const low = hex(resolve, '--k-surface-container-low')
  const text = hex(resolve, '--k-on-surface')
  const muted = hex(resolve, '--k-on-surface-variant')
  const line = hex(resolve, '--k-outline-variant')
  const accent = hex(resolve, '--accent')
  const soft = hex(resolve, '--accent-soft')
  const softOn = hex(resolve, '--accent-soft-on')

  const colors: Record<string, string> = {}
  const set = (key: string, value: string | null) => {
    if (value) colors[key] = value
  }
  // Translucent soft accent for selections, so the syntax colours under them
  // still read; Monaco takes an alpha as a fourth byte.
  const alpha = (value: string | null, a: string) => (value ? value + a : null)

  set('editor.background', surface)
  set('editorGutter.background', surface)
  set('editor.foreground', text)
  set('editorLineNumber.foreground', muted)
  set('editorLineNumber.activeForeground', text)
  set('editor.lineHighlightBackground', low)
  set('editor.lineHighlightBorder', alpha(low, '00'))
  set('editor.selectionBackground', alpha(soft, '66'))
  set('editor.inactiveSelectionBackground', alpha(soft, '33'))
  set('editor.selectionHighlightBackground', alpha(soft, '26'))
  set('editorCursor.foreground', accent)
  set('editorIndentGuide.background1', line)
  set('editorWhitespace.foreground', line)
  set('editorWidget.background', low)
  set('editorWidget.border', line)
  set('editorSuggestWidget.background', low)
  set('editorSuggestWidget.border', line)
  set('editorSuggestWidget.selectedBackground', soft)
  set('editorSuggestWidget.selectedForeground', softOn)
  set('editorHoverWidget.background', low)
  set('editorHoverWidget.border', line)
  set('focusBorder', accent)
  set('scrollbarSlider.background', alpha(line, 'aa'))
  set('scrollbarSlider.hoverBackground', alpha(muted, '66'))

  return { base: mode === 'dark' ? 'vs-dark' : 'vs', inherit: true, rules: [], colors }
}

/** A resolver over the real document root. */
export function documentVarResolver(): VarResolver {
  const style = getComputedStyle(document.documentElement)
  return (name) => style.getPropertyValue(name)
}
