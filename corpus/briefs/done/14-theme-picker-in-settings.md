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

## Outcome (2026-11-03)

**Built in `1542261` (version 1.82.0).** The Appearance section moved into
`modules/settings/AppearanceSettings.tsx`. It has four labelled radio groups,
Theme, Mode, Accent and Wallpaper, and Settings renders it.

**Theme cards.** Each card is 144px wide and draws a small desktop with its
theme's own values in the current mode:
- the theme's saved wallpaper preview;
- a window (lowest surface, outline border, a title bar on `high`, an accent
  bar in the soft accent and a line), its radius 0.4 of the theme's window
  radius;
- a taskbar strip on `low`.

The drawing sits on a span with `data-os-theme` / `data-theme` and the
theme's saved accent pairs set inline. Around it, the frame, the chosen
border and the check badge are the current theme's. The name is under the
card. The chosen card has the border and check badge the wallpaper previews
use.

**Scoping.**
- The four token blocks and the two shape blocks in `index.css` now match
  `[data-os-theme='…'][data-theme='…']` (or `[data-os-theme='…']`) on any
  element. The bare `:root` default stays.
- Classic's zero-radius rule is now `:root[data-os-theme='classic']
  *:not([data-os-theme='apricot'], [data-os-theme='apricot'] *)`, so an
  Apricot card in Classic keeps its corners.
- `contrast.test.ts` reads the widened selectors.

**Keyboard and screen readers.** Each group is `role="radiogroup"` with
`aria-labelledby` its visible label, and each option a `role="radio"` button
with `aria-checked`. Only the chosen option has `tabIndex 0`. ArrowLeft/Up,
ArrowRight/Down, Home and End move focus without choosing (the brief's "arrows
move, Space/Enter choose"), and Space/Enter choose through the button's
click. The cards are named "Apricot theme" and "Classic theme". Light/Dark is
labelled "Mode", and Accent and Wallpaper list the current theme's options.
Settings' own option buttons take `rounded-control`.

**Checked:**
- Typecheck and lint pass.
- `AppearanceSettings.test.tsx` (new, 7 tests): group order, card names, each
  card's scope, one tabbable option per group (the chosen one), arrow and End
  moves without choosing, click choosing, and a switch to Classic listing
  Classic's accents with its saved Cobalt and Grid. The Settings, store,
  theme and contrast tests also run (133 in total).
- In the browser, in all four combinations, the cards draw both themes
  correctly: sunset hills with a rounded window for Apricot, dots with a
  square crimson window for Classic, in light and dark. The focus ring moved
  by ArrowRight is visible in each.
- Choosing the Apricot card from Classic restyled the desktop and the open
  window at once. After a reload it was still Apricot, with Apricot's own
  accent and wallpaper.
- At 390×844 the Appearance section fits (366 px of 389). The Settings page
  still scrolls sideways because of the Apps section's rows, which predate
  this brief: [settings-apps-rows-overflow-on-a-phone](../../todos/settings-apps-rows-overflow-on-a-phone.md).
- Classic's File Manager window is still identical to before brief 08.
  Classic Settings differs from it by design (the theme cards).
