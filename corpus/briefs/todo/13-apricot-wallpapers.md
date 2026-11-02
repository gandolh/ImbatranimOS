# Brief 13 — Apricot's wallpapers

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
each theme has its own wallpapers. Brief 08 gave the wallpaper store a choice
per theme. Apricot's ids are `sunset-hills` (the default), `plain` and
`soft-dots`; Classic keeps `dots`, `grid` and `linen` (shown as "Fine").
Today the three Classic wallpapers are CSS backgrounds in `WALLPAPER_STYLES`
(`apps/core/src/shared/components/desktop/Desktop.tsx`), and Settings draws
previews from its own `WALLPAPERS` list (`modules/settings/Settings.tsx`).

The sunset-hills scene on the canvas
([Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html)) has:
- a sky gradient;
- a sun with a soft halo (a moon in dark mode);
- a few flat clouds;
- three layered hills;
- a sprinkle of stars in dark mode only.

Its colours per mode are `looks().apricot.light.w` and `.dark.w`.

Independent of 01-06; ships together with 08-15.

## Spec

1. **One wallpaper list per theme**, in one module the desktop and Settings
   both read: `id`, `name`, how to draw it, and how to draw its preview. Move
   Classic's three into it unchanged, and make `Settings.tsx`'s `WALLPAPERS`
   come from it.
2. **Sunset hills**:
   - An inline SVG behind the icons, marked `aria-hidden`. No image files.
   - Its colours are CSS variables set in the Apricot token blocks, so
     switching mode recolours it with no re-render.
   - It covers any desktop size: the hills hug the bottom edge, the sky
     stretches, the sun stays top-right.
   - The shapes come from the canvas's SVG paths.
3. **Plain** is `--k-surface-container-high`. **Soft dots** is a small dot
   grid in `--k-outline` on `--k-surface`, like the canvas's thumbnail.
4. **Previews** for Settings: the small versions used by Settings now, and by
   brief 14's theme cards later.
5. The Apricot block in `index.css` gets the scene variables (`--k-wall-sky-1`
   and so on), from the canvas, for light and dark.

## Must preserve

- Classic's wallpapers, pixel for pixel.
- Desktop icons, widgets, the rubber band and the context menu stay above the
  wallpaper and keep working.
- No network requests and no new files besides code.

## Acceptance

- Apricot light shows the sunset hills, and Apricot dark shows the dusk
  version with stars. Both match the canvas at 1280×800 and still look right
  at 390×844 and 2560×1440.
- Choosing Plain or Soft dots in Settings applies at once and survives a
  reload.
- Classic screenshots unchanged.
- Typecheck, lint and the touched tests pass.

## Files you OWN

- `apps/core/src/shared/components/desktop/Desktop.tsx` (wallpaper drawing).
- A new wallpapers module beside it.
- `apps/core/src/modules/settings/Settings.tsx`: the wallpaper list and
  previews only.
- `apps/core/src/index.css`: the scene variables in the Apricot blocks.
- `corpus/wiki/status.md`, `corpus/log.md`.
