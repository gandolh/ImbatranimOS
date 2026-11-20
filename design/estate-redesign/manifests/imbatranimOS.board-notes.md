# The board's notes: imbatranimOS

The estate redesign board is a private canvas. This file copies what its page for this app said beside the screens: the owner's asks, the decisions, the rules the design reopened, the open questions and the Floor. The owner's answers are in [README.md](../README.md#the-owners-decisions).

## Asks to the owner

- 1. B reopens the locked Start. It becomes a 704 px two-pane menu, and at 1280 it covers the desktop icons while it is open. decisions-themes.md, 2026-11-02, says the taskbar, Start button and menu, tray and desktop icons stay where they are. The button, the anchor and every item stay. Welcome, or does Start stay one 384 px column (A)? 2. Docs, Sheets, Slides, PDF and every kit app take these changes through kit:sync: sentence-case field labels in the kit's Input and Select, no 9 to 10 px chrome, firmer outlines and hairlines, a 10 px control radius, the deep dark selection for all five accent presets, dark ink on the destructive button (on-error #2b0d0d in dark is 7.9:1, white is 2.7:1 today), and a Solway display token. Inherit now, or hold the kit changes until each app has its own direction? 3. Approve B, Start opened wide, or A, Apricot settled? (beside `imbatranimOS-direction`)

## Decisions

- [ruling] One search band across the top of Start, with the strong focus ring it has today, so "every way of finding things" starts in one place. Today's head band with the name moves down to the foot. (beside `imbatranimOS-proposed-start-1280`)
- [ruling] Pinned and Recent sit beside the list on the pane's own surface. Recent's six two-line rows share the rest of the height, so the pane has no empty band. The A-Z list is the tinted pane on the left. It keeps sticky Solway letter heads, ends on a faded Firefox row and has a scrollbar edge, since the real list runs past nine apps. (beside `imbatranimOS-proposed-start-1280`)
- [ruling] The foot band holds the account (hourglass, wordmark, Signed in) and both session buttons, bordered at 3:1 (3.21 light, 3.58 dark). Cover screen and Log off hover to a soft fill; Log off hovers to error-container with its own text, never a solid red with white on it. The strip under today's Start, whose power glyph did nothing, is gone. (beside `imbatranimOS-proposed-start-1280`)
- [ruling, conv] On a phone Start is a full-screen sheet above the taskbar and it scrolls as one: search on top, then Pinned, Recent, and the A-Z list starting one scroll down; no inner scroll window. Like Android's app drawer, what you reach for comes first. At 390x844 the first screen shows the search, six pins, six recent files and the B head with Browser whole. Recent sets the path beside the name, right-aligned, and never cuts either. (beside `imbatranimOS-proposed-start-390`)
- [conv] The phone foot band sticks above the taskbar in one row: the hourglass tile, Signed in at 12/16, then Cover screen and Log off sized to their content at 48 px. The wordmark stays in the 1280 foot. The taskbar keeps the clock at 390 and 360. The one workspace button shows 1 over four dots, the current one in the accent, so it reads as one of four. (beside `imbatranimOS-proposed-start-390`)
- [direction file] The 32 icons are the fixture's, in the same order and grid. The ten Linux apps take the same raised tile. In dark each label sits on a soft chip, because the moon is light and would put pale text on a pale disc. (beside `imbatranimOS-proposed-desktop-1280`)
- [conv] Theme, Mode, Accent and Wallpaper keep today's order (decisions-themes.md, 2026-11-02), labels in sentence case. The chosen theme, wallpaper, mode and accent all show the soft fill or a 2 px deep edge, drawn over the preview so it is never hidden. Accent swatches show the preset's pastel in both modes. In dark, soft is a deep container with a pastel edge. (beside `imbatranimOS-proposed-settings-1280`)
- [conv] The window is taller than today's, so all four groups are whole instead of cutting Accent; the next section, Apps, peeks under a fade and a scrollbar edge, since Settings is one scrolling page of sections as it is today. (beside `imbatranimOS-proposed-settings-1280`)
- [conv] On a phone the Settings window fills the screen above the taskbar (a title band with minimise and close at 48 px), where today it floats half-size over the icons. With a window open, its task is an icon with the current underline, so the taskbar still holds the clock at 360. (beside `imbatranimOS-proposed-settings-390`)
- [conv] The sign-in card keeps its accent top edge, head band and field. The grey vignette over cream goes: a warm ground with the dotted grid, and the card one step lighter than the ground. The Sign in button is drawn disabled while the field is empty, as the app does, but as a quiet filled band, not a faded peach with white text (2.3:1 in today's shot). (beside `imbatranimOS-proposed-signin-1280`)
- [owner 2026-11-06 "best UX, not Win7"] Solway 700 for the wordmark, the A-Z letters and page titles; Figtree for the rest (Classic keeps Space Grotesk). Solway is on Google Fonts (static, latin); the app self-hosts, so the code brief vendors one woff2, the one new dependency. (beside `imbatranimOS-direction`)

## Reopened rules

- Recorded (decisions-themes.md, 2026-11-02): "The Windows-7-classic layout is not revisited: the taskbar, Start button and menu, tray and desktop icons stay where they are, and every way of finding things stays the same." Opened on 2026-11-06 ("Start's contents follow current desktops, not Windows 7"; the owner: "we are not stuck with win7 style"). Proposed: the button, the bottom-left anchor, the search, pins, A-Z list and Recent all stay; only the menu's size and arrangement change. Brief 88's must-not-touch list names the skeleton "unless the owner reopens one on the board". (beside `imbatranimOS-direction`)
- Recorded (ui-conventions.md, rule 14): the house field label is uppercase, tracked, 11 px (ui/Input.tsx, ui/Select.tsx, Settings.tsx), and rule 12 keeps nano, micro and tiny sizes in the shell. Proposed: field and group labels are sentence case, untracked, 11 px at weight 600 (Hallmark Floor 9); nothing in the shell is under 11 px, or 12 px on a phone. Tracked capitals such as PINNED, RECENT and IMBATRANIMOS go with it. (beside `imbatranimOS-direction`)

## The Floor

- Contrast is scripted over 71 pairs in both themes, all listed on the sheet. Text min 4.58 light and 4.84 dark; UI parts and focus rings min 3.07 and 3.17. Surface pairs run 1.03 to 2.01, and each one under 1.09 carries a 1 px edge of at least 1.3 or a shadow. The one exception is the dark Settings window edge on the mid hill (1.28), where the window is also 1.33 darker than the wall. Floating layers (Start, windows) use container-low in both modes. No page overflow, control spill, clipped text, text wider than its column or overlapping neighbours at 1280, 1366x768, 1024, 768, 390 or 360, in either theme; phone targets are 44 to 48 px; at 390 and 360 the last list row ends 12 px above the foot band. On the phone desktop the stride is 88 px, rows are counted from the height, and no label sits under the taskbar at 390x844 or 360x800. Start fits a 1366x768 screen (top at 8 px) with the A-Z pane and right pane scrolling inside. Sloplint --scope app --render gives 0 FAIL and 0 REFLEX on all eight Proposed twins, with waivers 39b, 72 and 80 and dismissed warnings in the CSS stamp. Gate 56 fires on the sticky letter heads and is a Floor gate that cannot be waived (a waiver is rejected), so the heads use top:-1px; only one is ever stuck, each sits in its own section. First screen at 1280x800: nine A-Z rows whole, six pins, six recent files, foot band, clock. At 1366x768: eight rows whole, the rest scrolls. At 390x844 and 360x800: search, six pins, six recent files, the B head with Browser whole, foot band with Signed in, clock. (beside `imbatranimOS-direction`)

## Other notes

- The states other than Nothing found, the sign-in error and Signing in are proposals, not today's strings. That covers the hidden Recent block, the app list skeleton, and Settings' section loading and error. The Firefox row under File Manager is also a stand-in. The fixture stops at File Manager, and Firefox's line comes from its desktop entry, so the row has a name and no description. It only shows the list runs on, and it is hidden on the phone sheet.
- Handoff: manifests/imbatranimOS.tokens.css and imbatranimOS.tokens-map.md carry the tokens in the OS's own names and its data-os-theme and data-theme mechanism. The dark soft pairs per preset live in appearanceStore.ts, listed at the end of the CSS.
- The glyphs on the board are stand-ins: each app gets its own stroke glyph so no two share one. The built OS keeps the icons it shows today, the Linux apps' own icons and the web apps' glyphs.

## Contrast, as measured

| Pair | Light | Dark | Needs |
|---|---|---|---|
| on-surface on surface-container-low (Start body) | 14.01 | 13.36 | 4.5 |
| on-surface on surface-container (A-Z pane, foot) | 12.17 | 12.14 | 4.5 |
| on-surface on surface-container-low (window body) | 14.01 | 13.36 | 4.5 |
| on-surface-variant on surface-container (descriptions) | 5.96 | 7.41 | 4.5 |
| on-surface-variant on surface-container-low (paths, labels) | 6.86 | 8.15 | 4.5 |
| on-surface-variant on surface-container (window caption) | 5.96 | 7.41 | 4.5 |
| on-surface-variant on surface-container-highest | 5.17 | 5.7 | 4.5 |
| on-surface-variant on surface-container-lowest (placeholder) | 7.18 | 8.87 | 4.5 |
| on-surface on surface-container-lowest (input text) | 14.67 | 14.53 | 4.5 |
| accent on surface-container (letter heads) | 4.86 | 7.35 | 4.5 |
| accent on surface-container-low (glyphs, links) | 5.6 | 8.09 | 4.5 |
| accent on surface-bright (glyph on a tile) | 5.86 | 5.95 | 4.5 |
| accent-on on accent (primary button) | 5.96 | 7.63 | 4.5 |
| accent-soft-on on accent-soft (Start pill, current pip, chosen) | 7.63 | 7.96 | 4.5 |
| on-error-container on error-container (Log off hover) | 13.26 | 10.05 | 4.5 |
| on-error on error (destructive button) | 6.46 | 7.89 | 4.5 |
| error on surface-container-highest (field error) | 4.58 | 4.84 | 4.5 |
| error on surface-container-low (sign-in error) | 6.07 | 6.92 | 4.5 |
| on-surface on wallpaper hill-1 (desktop label) | 8.45 | 8.38 | 4.5 |
| on-surface on wallpaper sky-2 (desktop label) | 10.9 | 11.88 | 4.5 |
| on-surface on wallpaper hill-3 (taskbar-adjacent label) | 5.68 | 11.99 | 4.5 |
| on-surface on a desktop label (light: on the sky; dark: the chip over the moon) | 10.9 | 8.21 | 4.5 |
| outline on surface-container-lowest (search, input edge) | 3.87 | 4.28 | 3 |
| outline on surface-container (foot buttons) | 3.21 | 3.58 | 3 |
| outline on surface-container-high (control on a high band) | 3.07 | 3.17 | 3 |
| outline on surface-container (Settings option edge) | 3.21 | 3.58 | 3 |
| accent-soft-edge on surface-container-low (selected edge) | 5.6 | 8.09 | 3 |
| accent-soft-edge on surface-container (selected edge in Settings) | 4.86 | 7.35 | 3 |
| accent (focus ring) on surface-container-low | 5.6 | 8.09 | 3 |
| accent (focus ring) on surface-container | 4.86 | 7.35 | 3 |
| accent (focus ring) on wallpaper sky-2 | 4.36 | 7.19 | 3 |
| on-surface-variant on surface-container-low (icon) | 6.86 | 8.15 | 3 |
| surface-container on surface-container-low (A-Z pane on panel) | 1.15 | 1.1 | sep |
| outline-variant on surface-container-low (hairline on panel) | 1.51 | 1.7 | sep |
| outline-variant on surface-container (hairline on pane) | 1.31 | 1.55 | sep |
| surface-container-low on wallpaper sky-2 (Start on the wall) | 1.29 | 1.13 | sep |
| outline-variant on wallpaper sky-2 (Start edge) | 1.17 | 1.52 | sep |
| surface-container-low on wallpaper hill-3 (taskbar on the wall) | 2.46 | 1.11 | sep |
| outline-variant on wallpaper hill-3 (Start edge near the bar) | 1.63 | 1.53 | sep |
| surface-bright on wallpaper sky-2 (desktop tile) | 1.35 | 1.21 | sep |
| surface-bright on surface-container (row tile on pane) | 1.21 | 1.24 | sep |
| surface-bright on surface-container-low (pin tile on panel) | 1.05 | 1.36 | sep |
| surface-container-low on surface (dark sign-in card on its ground) | 1.03 | 1.13 | sep |
| surface-container on surface-container-low (option fill on the window) | 1.15 | 1.1 | sep |
| accent swatch (preset pastel, lowest of five) on surface-container | 1.2 | 7.35 | sep |
| surface-container-lowest on surface-container (foot button fill) | 1.21 | 1.2 | sep |
| surface-container-low on wallpaper hill-2 (Settings window on the wall) | 2.01 | 1.33 | sep |
| surface-container-low on wallpaper sky-2 (Settings window on the wall) | 1.29 | 1.13 | sep |
| outline-variant on wallpaper hill-2 (window edge) | 1.33 | 1.28 | sep |
| surface-container-low on its sign-in ground (light: container-high, dark: surface) | 1.2 | 1.13 | sep |
| outline-variant on its sign-in ground (light: container-high, dark: surface) | 1.25 | 1.93 | sep |
| Apricot: white on strong (light) / ink on pastel strong (dark) | 5.96 | 7.63 | 4.5 |
| Apricot: strong on surface-container-high (text, ring) | 4.65 | 6.52 | 4.5 |
| Apricot: soft-on on soft (chosen) | 7.63 | 7.96 | 4.5 |
| Apricot: edge on surface-container-low (UI 3) | 5.6 | 8.09 | 3 |
| Rose: white on strong (light) / ink on pastel strong (dark) | 5.91 | 7.63 | 4.5 |
| Rose: strong on surface-container-high (text, ring) | 4.61 | 6.53 | 4.5 |
| Rose: soft-on on soft (chosen) | 7.63 | 8.83 | 4.5 |
| Rose: edge on surface-container-low (UI 3) | 5.55 | 8.1 | 3 |
| Butter: white on strong (light) / ink on pastel strong (dark) | 5.91 | 10.16 | 4.5 |
| Butter: strong on surface-container-high (text, ring) | 4.61 | 8.68 | 4.5 |
| Butter: soft-on on soft (chosen) | 10.16 | 8.16 | 4.5 |
| Butter: edge on surface-container-low (UI 3) | 5.55 | 10.77 | 3 |
| Sage: white on strong (light) / ink on pastel strong (dark) | 5.89 | 8.22 | 4.5 |
| Sage: strong on surface-container-high (text, ring) | 4.61 | 7.02 | 4.5 |
| Sage: soft-on on soft (chosen) | 8.22 | 8.32 | 4.5 |
| Sage: edge on surface-container-low (UI 3) | 5.54 | 8.71 | 3 |
| Sky: white on strong (light) / ink on pastel strong (dark) | 5.91 | 8.49 | 4.5 |
| Sky: strong on surface-container-high (text, ring) | 4.62 | 7.26 | 4.5 |
| Sky: soft-on on soft (chosen) | 8.49 | 9.32 | 4.5 |
| Sky: edge on surface-container-low (UI 3) | 5.56 | 9.01 | 3 |

## The runner-up

**Runner-up: A, Apricot, settled (sketch only, not built)**

Note: how this direction was picked. Two directions were sketched (A evolve today, B Start opened wide) and two judges compared every pair against today, in both orders, at 1280 and 390, both in Apricot light (today's dark captures are Classic dark, another theme). All 12 verdicts agreed: B won 4, A 2, today 0. Today lost on legibility: app descriptions cut with ellipses, file paths at about 9 px, and on the phone the clock pushed off the screen. B won on grouping and reach: a search band, the A-Z list on its own pane beside Pinned and Recent, the account and session in one foot band, and at 1280 nine apps, six pins and six recent files at once. What A did better: a compact panel that leaves the desktop and its icons in view, and on the phone a taller A-Z list. Say so here if you'd rather keep the one-column Start (A).

## The artboards on the board

- Direction · Start, opened wide
- Start · 1280 · light · today
- Start · 390 · light · today
- Start · 1280 · light · proposed
- Start · 390 · dark · proposed
- Desktop · 1280 · light · today
- Desktop · 390 · light · today
- Desktop · 1280 · light · proposed
- Desktop · 390 · dark · proposed
- Settings, Appearance · 1280 · light · today
- Settings, Appearance · 390 · light · today
- Settings, Appearance · 1280 · light · proposed
- Settings, Appearance · 390 · dark · proposed
- Sign in · 1280 · light · today
- Sign in · 390 · light · today
- Sign in · 1280 · light · proposed
- Sign in · 390 · dark · proposed
- Runner-up A, Apricot, settled · light 1280 (sketch)
- Runner-up A, Apricot, settled · light 390 (sketch)
