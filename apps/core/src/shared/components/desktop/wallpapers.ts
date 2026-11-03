import type { CSSProperties, ComponentType } from 'react'
import type { ThemeId } from '../../store/appearanceStore'
import type { Wallpaper } from '../../store/wallpaperStore'
import { SunsetHills } from './SunsetHills'

/**
 * Each theme's wallpapers, read by the desktop and by Settings' previews.
 *
 * Every colour is a token or a `--k-wall-*` variable from the token blocks in
 * index.css, so switching the mode recolours a wallpaper with no re-render.
 */
export type WallpaperDef = {
  id: Wallpaper
  name: string
  /** The desktop's background. */
  background: CSSProperties
  /** Drawn over the background, behind the icons, if the wallpaper is a scene. */
  scene?: ComponentType
  /** The small version, for Settings. */
  preview: CSSProperties
}

const SKY =
  'linear-gradient(180deg, var(--k-wall-sky-1) 0%, var(--k-wall-sky-2) 55%, var(--k-wall-sky-3) 100%)'

// Theme-aware patterns — lines use the active outline token, the base the
// active surface token, so both modes read correctly.
export const WALLPAPERS: Record<ThemeId, WallpaperDef[]> = {
  apricot: [
    {
      id: 'sunset-hills',
      name: 'Sunset hills',
      background: { backgroundImage: SKY, backgroundColor: 'var(--k-wall-sky-1)' },
      scene: SunsetHills,
      preview: {
        backgroundImage:
          'radial-gradient(circle at 78% 30%, var(--k-wall-sun) 0 9%, transparent 10%), ' +
          'linear-gradient(180deg, var(--k-wall-sky-1) 0%, var(--k-wall-sky-3) 56%, ' +
          'var(--k-wall-hill-1) 56%, var(--k-wall-hill-1) 70%, var(--k-wall-hill-2) 70%, ' +
          'var(--k-wall-hill-2) 84%, var(--k-wall-hill-3) 84%)',
      },
    },
    {
      id: 'plain',
      name: 'Plain',
      background: { backgroundColor: 'var(--k-surface-container-high)' },
      preview: { backgroundColor: 'var(--k-surface-container-high)' },
    },
    {
      id: 'soft-dots',
      name: 'Soft dots',
      background: {
        backgroundImage: 'radial-gradient(var(--k-outline) 1.2px, transparent 1.6px)',
        backgroundSize: '22px 22px',
        backgroundColor: 'var(--k-surface)',
      },
      preview: {
        backgroundImage: 'radial-gradient(var(--k-outline) 1.2px, transparent 1.6px)',
        backgroundSize: '10px 10px',
        backgroundColor: 'var(--k-surface)',
      },
    },
  ],
  classic: [
    {
      id: 'dots',
      name: 'Dots',
      background: {
        backgroundImage: 'radial-gradient(var(--k-outline-variant) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        backgroundColor: 'var(--k-surface)',
      },
      preview: {
        backgroundImage: 'radial-gradient(var(--k-outline-variant) 1px, transparent 1px)',
        backgroundSize: '12px 12px',
        backgroundColor: 'var(--k-surface)',
      },
    },
    {
      id: 'grid',
      name: 'Grid',
      background: {
        backgroundImage:
          'linear-gradient(var(--k-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--k-outline-variant) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        backgroundColor: 'var(--k-surface)',
      },
      preview: {
        backgroundImage:
          'linear-gradient(var(--k-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--k-outline-variant) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
        backgroundColor: 'var(--k-surface)',
      },
    },
    {
      id: 'linen',
      name: 'Fine',
      background: {
        backgroundColor: 'var(--k-surface)',
        backgroundImage:
          'radial-gradient(var(--k-outline-variant) 0.5px, transparent 0.5px), radial-gradient(var(--k-outline-variant) 0.5px, var(--k-surface) 0.5px)',
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 4px 4px',
      },
      preview: {
        backgroundImage:
          'radial-gradient(var(--k-outline-variant) 0.5px, transparent 0.5px), radial-gradient(var(--k-outline-variant) 0.5px, var(--k-surface) 0.5px)',
        backgroundSize: '6px 6px',
        backgroundPosition: '0 0, 3px 3px',
        backgroundColor: 'var(--k-surface)',
      },
    },
  ],
}

/** A wallpaper by id, from either theme; an id with no drawing gets the plain surface. */
export function wallpaperById(id: Wallpaper): WallpaperDef {
  for (const list of Object.values(WALLPAPERS)) {
    const found = list.find((w) => w.id === id)
    if (found) return found
  }
  return { id, name: id, background: { backgroundColor: 'var(--k-surface)' }, preview: {} }
}
