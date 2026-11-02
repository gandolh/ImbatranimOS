# Brief 14 — The theme picker in Settings

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
Settings → Appearance picks the theme from preview cards. The owner saw the
canvas's Settings window
([Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html), the
"Settings window" section). In it, Appearance reads, top to bottom:
- Theme: two cards, Apricot and Classic;
- Mode: Light and Dark;
- Accent: the current theme's presets;
- Wallpaper: the current theme's set.

Briefs 08-13 put the state, values and wallpapers in place. The Appearance
section in `apps/core/src/modules/settings/Settings.tsx` still shows only
Light/Dark, the accents and the wallpapers.

Independent of 01-06; ships together with 08-15.

## Spec

1. **Theme cards.** One card per theme: a small desktop drawn in that theme's
   own values in the current mode, with these parts:
   - the theme's current wallpaper preview (13);
   - a small window with its title bar, an accent bar and a line;
   - a taskbar strip;
   - the theme's name under it.

   The chosen card has the ring the wallpaper previews use.
   - The token blocks in `index.css` are written against `:root`. A card
     needs them scoped to its own element: extend the selectors (for example
     `[data-os-theme][data-theme]` on any element), don't duplicate the
     values.
   - Choosing a card calls `setTheme`. The accent and wallpaper switch to
     that theme's saved choices.
2. **Mode**: the Light/Dark segmented control, labelled "Mode".
3. **Order and labels**: Theme, Mode, Accent, Wallpaper. Accent and Wallpaper
   list the current theme's options.
4. **Keyboard and screen readers**: each group is a radio group (arrow keys
   move, Space/Enter choose) with a visible label, and each card has an
   accessible name ("Apricot theme", "Classic theme").
5. **The switch is instant**: no reload, and open windows restyle live.

## Must preserve

- The Appearance section's other content and the rest of Settings.
- The rule from 10: a chosen card or option uses the soft accent fill or the
  ring, never a strong fill.

## Acceptance

- Switching Apricot ↔ Classic and Light ↔ Dark in any order restyles the
  desktop and open windows at once, survives a reload, and comes back to each
  theme's own accent and wallpaper.
- The cards show both themes correctly in both modes.
- Keyboard-only: Tab reaches each group, arrows move and Space chooses, with
  the focus ring visible in all four combinations.
- At phone width (390px) the section stacks without horizontal scroll.
- Typecheck, lint and the Settings tests pass.

## Files you OWN

- `apps/core/src/modules/settings/Settings.tsx` (the Appearance section) and
  new components beside it.
- `apps/core/src/index.css`: the selector change that lets a card scope the
  token blocks.
- `corpus/wiki/status.md`, `corpus/log.md`.
