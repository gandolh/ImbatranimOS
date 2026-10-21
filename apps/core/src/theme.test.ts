import { readFileSync } from 'fs'
import { join } from 'path'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

/**
 * Brief 163 moved the desktop's `@theme` block out of `index.css` into the
 * kit (`packages/ui/src/theme.css`), so a marketplace kit app builds against
 * the same token names. No value was to change. `BEFORE` is the block as it
 * stood in `index.css` before the move, token for token.
 *
 * The one intended difference is `@theme static`: every token is emitted as a
 * CSS variable even when no desktop class uses it, because a kit app's
 * stylesheet may. Comparing the whole built CSS before and after the move
 * showed exactly that: the same rules, the same values, and the previously
 * unused tokens of this block added to the theme layer.
 */
const BEFORE: [string, string][] = [
  ['--color-surface', 'var(--k-surface)'],
  ['--color-surface-dim', 'var(--k-surface-dim)'],
  ['--color-surface-bright', 'var(--k-surface-bright)'],
  ['--color-surface-container-lowest', 'var(--k-surface-container-lowest)'],
  ['--color-surface-container-low', 'var(--k-surface-container-low)'],
  ['--color-surface-container', 'var(--k-surface-container)'],
  ['--color-surface-container-high', 'var(--k-surface-container-high)'],
  ['--color-surface-container-highest', 'var(--k-surface-container-highest)'],
  ['--color-on-surface', 'var(--k-on-surface)'],
  ['--color-on-surface-variant', 'var(--k-on-surface-variant)'],
  ['--color-inverse-surface', 'var(--k-inverse-surface)'],
  ['--color-inverse-on-surface', 'var(--k-inverse-on-surface)'],
  ['--color-outline', 'var(--k-outline)'],
  ['--color-outline-variant', 'var(--k-outline-variant)'],
  ['--color-background', 'var(--k-surface)'],
  ['--color-on-background', 'var(--k-on-surface)'],
  ['--color-surface-variant', 'var(--k-surface-container-high)'],
  ['--color-surface-tint', 'var(--accent)'],
  ['--color-primary', 'var(--accent)'],
  ['--color-on-primary', 'var(--accent-on)'],
  ['--color-primary-container', 'var(--accent)'],
  ['--color-on-primary-container', 'var(--accent-on)'],
  ['--color-inverse-primary', 'var(--accent)'],
  ['--color-heritage', 'var(--accent)'],
  ['--color-secondary', 'var(--k-on-surface-variant)'],
  ['--color-on-secondary', 'var(--k-surface)'],
  ['--color-secondary-container', 'var(--k-surface-container-high)'],
  ['--color-on-secondary-container', 'var(--k-on-surface)'],
  ['--color-tertiary', 'var(--k-on-surface-variant)'],
  ['--color-on-tertiary', 'var(--k-surface)'],
  ['--color-tertiary-container', 'var(--k-surface-container-high)'],
  ['--color-on-tertiary-container', 'var(--k-on-surface)'],
  ['--color-error', 'var(--k-error)'],
  ['--color-on-error', '#ffffff'],
  ['--color-error-container', 'var(--k-error-container)'],
  ['--color-on-error-container', 'var(--k-on-error-container)'],
  ['--font-ui', "'Space Grotesk', ui-sans-serif, system-ui, sans-serif"],
  ['--font-content', "'Inter', ui-sans-serif, system-ui, sans-serif"],
  ['--spacing-half', '4px'],
  ['--spacing-base', '8px'],
  ['--spacing-double', '16px'],
  ['--spacing-window-padding', '12px'],
  ['--spacing-container-gap', '8px'],
]

const SRC = __dirname
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8')
const themeCss = readFileSync(join(SRC, '../../../packages/ui/src/theme.css'), 'utf8')

/** Every `--name: value;` declaration in `css`, comments dropped, in order. */
function declarations(css: string): [string, string][] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...bare.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(
    (m) => [m[1], m[2].trim()] as [string, string]
  )
}

describe('the theme tokens moved into the kit (brief 163)', () => {
  it('index.css imports the kit theme and declares no @theme of its own', () => {
    expect(indexCss).toContain("@import '../../../packages/ui/src/theme.css';")
    expect(indexCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/@theme\b/)
  })

  it('holds exactly the tokens index.css had, with the same values, in one static block', () => {
    expect(themeCss.match(/@theme\b[^{]*\{/g)).toEqual(['@theme static {'])
    expect(declarations(themeCss)).toEqual(BEFORE)
  })

  it('emits every token as a CSS variable even when no class uses it', async () => {
    const compiler = await compile(`${themeCss}\n@tailwind utilities;`)
    const built = declarations(compiler.build([]))
    expect(built).toEqual(BEFORE)
  })

  it("resolves a kit app's utility to the desktop's variable", async () => {
    const compiler = await compile(`${themeCss}\n@tailwind utilities;`)
    // Joined, not written out: the desktop's Tailwind scans this directory,
    // and a literal class name here would put that utility in its CSS.
    const css = compiler.build([
      ['bg', 'surface-tint'].join('-'),
      ['text', 'on-tertiary-container'].join('-'),
      ['p', 'window-padding'].join('-'),
    ])
    expect(css).toContain('background-color: var(--color-surface-tint)')
    expect(css).toContain('color: var(--color-on-tertiary-container)')
    expect(css).toContain('padding: var(--spacing-window-padding)')
  })
})
