import { describe, expect, it } from 'vitest'
import { buildMonacoTheme, type VarResolver } from './osMonacoTheme'

/**
 * The editor's chrome comes from the desktop's tokens in both themes; syntax
 * colours stay Monaco's own, by mode.
 */

const APRICOT_LIGHT: Record<string, string> = {
  '--k-surface-container-lowest': '#fffdf9',
  '--k-surface-container-low': '#fdf7f0',
  '--k-on-surface': '#3a2a20',
  '--k-on-surface-variant': '#735949',
  '--k-outline-variant': '#ead8c6',
  '--accent': ' #A04B23',
  '--accent-soft': '#f2a97e',
  '--accent-soft-on': '#33241b',
}

const resolver =
  (vars: Record<string, string>): VarResolver =>
  (name) =>
    vars[name] ?? ''

describe('buildMonacoTheme', () => {
  it('draws the editor on the window surface with the token text and accent', () => {
    const t = buildMonacoTheme('light', resolver(APRICOT_LIGHT))
    expect(t.base).toBe('vs')
    expect(t.inherit).toBe(true)
    expect(t.colors['editor.background']).toBe('#fffdf9')
    expect(t.colors['editor.foreground']).toBe('#3a2a20')
    expect(t.colors['editorLineNumber.foreground']).toBe('#735949')
    expect(t.colors['editorCursor.foreground']).toBe('#a04b23')
  })

  it('keeps selections translucent so the syntax colours under them read', () => {
    const t = buildMonacoTheme('light', resolver(APRICOT_LIGHT))
    expect(t.colors['editor.selectionBackground']).toBe('#f2a97e66')
    expect(t.colors['editorSuggestWidget.selectedForeground']).toBe('#33241b')
  })

  it('takes the dark base in dark mode', () => {
    expect(buildMonacoTheme('dark', resolver(APRICOT_LIGHT)).base).toBe('vs-dark')
  })

  it('leaves a colour to the base theme when its token does not resolve', () => {
    const t = buildMonacoTheme('dark', resolver({}))
    expect(t.colors).toEqual({})
    expect(t.rules).toEqual([])
  })
})
