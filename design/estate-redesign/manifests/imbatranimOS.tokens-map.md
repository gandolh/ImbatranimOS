# imbatranimOS tokens map (direction B, Start opened wide)

The OS does not use the board's role names: its token names are the contract with every add-on and kit app, so none are renamed. The board build was drawn in the app's own `--k-*` and `--accent*` names; this lists what moved, what is new, and what the design no longer uses.

## Renamed or remapped (board role to app token; the values move, the names do not)

- surface, surface-dim, surface-bright, container-lowest/low/container/high/highest: `--k-surface`, `--k-surface-dim`, `--k-surface-bright`, `--k-surface-container-*`. Light moves `container` (#f6ebdf to #f4e6d7). Dark moves all of them one step so the panel, pane and tile read as raised (1c and 1d in the CSS).
- on-surface, on-surface-variant, inverse: `--k-on-surface`, `--k-on-surface-variant`, `--k-inverse-surface`, `--k-inverse-on-surface`.
- outline, outline-variant: `--k-outline`, `--k-outline-variant`. `outline` is the control edge and now reaches 3:1 (light #c4a58c to #9a7a64, dark #6e5c50 to #937a69); Classic's moves to #86868b and #6c6c74. The hairline moves up a step (light #ead8c6 to #e0c8b2, dark #3f352f to #54443a).
- accent strong and soft: `--accent`, `--accent-on`, `--accent-soft`, `--accent-soft-on` (stamped by applyAppearance). Light values are today's. Dark `soft` and `softOn` become a deep container and its pastel text per preset (the table at the end of the CSS), in `appearanceStore.ts`.
- accent-soft-edge (the selected chip's deep edge): no new token. It is `--accent` in both modes, because dark strong is the pastel. Use `border-primary` or `ring-primary`, as the Mode and Accent options already do.
- error pair: `--k-error`, `--k-error-container`, `--k-on-error-container`. Values move (dark error #ff7171 to #ff8a80; on-error-container light #93000a to #410002, dark #ffb4ab to #ffdad6). The Log off hover goes to `error-container` with `on-error-container` instead of a solid `error` fill.
- radii: `--k-radius-control` 8 to 10. The other five (`window` 12, `menu` 14, `item` 8, `tile` 12, `small` 4) do not move.
- shadows: `--k-shadow-menu` (Start) gets two layers; `--k-shadow-tile` becomes a resting shadow (0 1px 2px and 0 3px 8px) instead of 0 4px 12px. The window, dialog, popup, toast, tooltip, tray and card shadows are today's.
- type: `--text-label` 11/15, `--text-control` 12/16, `--text-body` 13/18, `--text-lead` 15/18, `--text-title` 17/22 (unchanged), `--text-headline` 24.375 to 24/30 (page titles), each with a line height; `(pointer: coarse)` raises label to 12/16 and control and body to 14/20.

- Floating layer bodies: Start, the Settings window and every window use `--k-surface-container-low` as the body in both modes (light #fdf7f0, dark #29211c), not `--k-surface`. The change is in the window and Settings classes, not in a token value, so kit apps that read `--k-surface` are unaffected. Unselected Mode and Accent controls sit on `--k-surface-container`.
- Accent swatches in Settings paint the preset's pastel (`dark.strong`, equal to `light.soft`) in both modes, instead of `preset[mode].soft`, which is the deep container in dark.

## New tokens (and the component that needs each)

- `--k-on-error` (per mode: #ffffff light, #2b0d0d dark) and `--color-on-error: var(--k-on-error)`: the kit's destructive Button (white on the dark error is 2.7:1 today). Classic gets the same pair.
- `--k-font-display` and `--font-display` (Solway 700 in Apricot, Space Grotesk in Classic): the taskbar and foot wordmarks, the Start A-Z letter heads, page titles in Settings and the sign-in card, and the kit's page-title slot. One vendored woff2 (`solway-latin-700.woff2`), declared with its `@font-face` in `index.css`.
- `--text-index` (16 px, line height 20): the Start A-Z letter heads in Solway 700; the board draws them 16/20.
- `--text-*--line-height` for label, control, body, lead, title and headline: any component that sets text size gets its line height from the token. `--text-lead` already exists (15px); it now carries a line height.
- `--k-label-shadow` is board-only: the board used it for the desktop icon label's shadow; the app keeps its component class.
- Board-only, not for the code: `--accent-<preset>-soft(-on)` (the Settings accent chips draw each preset from `ACCENT_PRESETS[theme][mode].soft`, as today), and `--classic-*` (the Settings theme card previews draw Classic's own values through its `data-os-theme` scope, as today).

## Tokens the design no longer uses (keep or drop is the code brief's call)

- `--text-nano`, `--text-micro` and `--text-tiny` (8, 9 and 10 px): the shell stops using them (nothing under 11 px; 12 px on a phone). Kit apps may still use them, so dropping needs their own check.
- `--k-shadow-tile`'s old long blur, `--k-shadow-popup` and `--k-shadow-tray` for the Start (Start uses `--k-shadow-menu`): unchanged values, but Start no longer draws its own.
- The uppercase tracked field label (`tracking-wider uppercase` in `ui/Input.tsx` and `ui/Select.tsx`, `tracking-widest uppercase` in Settings' `Group`): replaced by sentence case at `text-label` weight 600. A component change, not a token.
- `--color-inverse-primary`, `--color-heritage`, `--color-surface-tint`: no screen of this design uses them (they stay, the kit contract).

## What the apps pick up, and through what

- Every `--k-*` value and the `--accent*` pairs reach Docs, Sheets, Slides, PDF and every kit app at once, at runtime: the apps resolve the kit's token names to the desktop's CSS variables, so the new surfaces, firmer outlines, hairlines, the dark selection and the error pair arrive when the OS is deployed, with no app rebuild.
- `kit:sync` carries what lives in the kit's source (`packages/ui/src`): `theme.css` (`--color-on-error`, `--font-display`, the type scale and its line heights), and the kit components, so the sentence-case field label in `Input` and `Select`, `Button`'s dark destructive text, and the display-face page-title slot. Each app repo takes them at its next `kit:sync` (commit the OS first, as the group recipe says). Until then the apps keep today's uppercase field labels, their own 9 to 10 px chrome and the white-on-error button, while their colours already move with the OS.
- Solway reaches an app only if its repo carries the woff2 (the display token falls back to Georgia). The `@font-face` lives in the desktop's `index.css`, so apps loaded in the desktop's window inherit it; an app run on its own needs the file.
