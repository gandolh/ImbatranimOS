# imbatranimOS: two directions

Written 2026-11-13 by the art director. Repo: imbatranimOS, brief 88. Both directions keep the recorded calls: the skeleton (taskbar along the bottom; Start button and menu at the bottom left; tray at the right; desktop icons from the top left; `decisions-themes.md` 2026-11-02), no glass, two themes (Apricot the default, Classic kept whole) each in Light / Dark / System with light first, token names that never change (the kit's contract with every add-on and kit app, in four combinations and every accent preset), "selected is soft, an action is strong" with a deep edge on a selected chip, compact density on the 13 px body (brief 88 acceptance), the six token radii, shadows only on floating layers, "best UX, not Win7" (owner 2026-11-06), familiar navigation with no metaphor, and self-hosted woff2 fonts.

Registry: Figtree and the apricot accent are today's (Apricot, 2026-11-02), so they are allowed; Figtree is also SocialEvents B's body face, and the rust sits in satchel's clay family. Held elsewhere, never used here: Literata, Public Sans, Rethink Sans, Bricolage Grotesque, Hanken Grotesk, Atkinson Hyperlegible Next, Sofia Sans, Castoro, Manrope, Newsreader, Archivo, Azeret Mono, Red Hat Mono, Schibsted Grotesk, Spline Sans Mono, Onest, Source Code Pro, IBM Plex, Barlow, Reddit Sans/Mono, Overpass, Albert Sans, Fragment Mono, Geist, Lexend (Inter only as today's content face); accents teal, amber, moss, ultramarine, cobalt, azure, patina, lichen, mint, violet, plum, mulberry.

## 1. Today's strengths (keep all of them)

1. **A skeleton nobody has to learn.** Start (hourglass, `Imbatranim` + `OS` in the accent) and search at the left, tasks in the middle, then pips, load, volume, notifications and a two-line clock at the right.
2. **Start holds every way to find something in one panel:** a search field focused on open with a strong ring, a 3×2 pinned grid, one A-Z list where each app says what it does, Recent files with their paths and a clear button, then the session.
3. **Bands group things.** Start's head and session foot sit a tone deeper than its body and hairlines split the groups; windows have a title band and a foot band.
4. **Floating layers read as floating.** Start, windows, the sign-in card and desktop tiles lift off the wallpaper on warm shadows and soft corners.
5. **Desktop icons are raised white tiles** with two-line labels, column by column from the top left, over the token-drawn sunset hills (with a dusk version): the warm, calm look the owner chose.
6. **Selected is soft, an action is strong:** the current pip and the chosen mode are pastel with a deep edge, the current task has a strong underline, and one preset recolours it all.

Faults both directions fix:
- Tracked capitals (`PINNED`, `RECENT`, `IMBATRANIMOS`, the kit's field labels) fail Floor 9: sentence case, untracked.
- `5% · 5.0/15.2 GB` fails Floor 10: two readouts, `CPU 5%` and `RAM 5.0/15.2 GB` (the labels come from its `CPU / RAM` tooltip).
- 9-10 px chrome text (paths, `Signed in`, pin labels) rises to 11 px or more; descriptions cut with an ellipsis (CAD, Calculator) wrap in full.
- The `IMBATRANIMOS` strip under Start repeats the head and its power glyph does nothing (it goes).
- "Log off" hovers to a solid `error` fill with white on it, which is 2.7:1 in dark today. Hover goes to `error-container` with `on-error-container` (7.2 / 9.5), and `on-error`, hard-coded `#ffffff` in `theme.css`, becomes per mode: `#ffffff` / `#2b0d0d` (7.9 on the dark error) for the kit's destructive buttons.
- Not fixed by A: today's Start shows about 3 A-Z rows at 1280. A keeps that budget (Browser, CAD, Calculator, the top of Calendar); B answers it.
- Control edges are 2.2 / 2.5:1, under 3:1.
- At 390 the taskbar runs off the edge and cuts the clock, Start stays the 320 px desktop panel, and Classic breaks labels mid-word (`LibreOffic e`).
- Apricot dark selects with the bright pastel, so a hovered Start row is a loud peach bar.

## 2. The main screen

Start open over the desktop, with the taskbar: the surface the owner reopened on 2026-11-06, and the one that shows the whole shell. Today: `light-1280-start.png` and `light-390-start.png`. At 390 the sketch draws the phone layout (coarse pointer), since Android is the main phone. The full build's other two screens: Settings → Appearance in its window, and sign-in.

**Controller:** `dark-1280-start.png` and `dark-390-start.png` are **Classic dark** (`shots.md`), while the sketches' dark is Apricot dark, so the judges' phone-dark pair crosses themes. Capture Apricot dark at 390, or tell the judges.

## 3. The content fixture (word for word; English)

- **Wallpaper** (as `SunsetHills.tsx` draws it). Light: sky `#fde9d8` → `#fbd5bd` → `#f6bfa3`; sun `#fff4e6` at 84% / 25% with a halo at 0.28; clouds `#fff8f1` at 0.85; hills `#f0b794`, `#e7a183`, `#d98d73`. Dusk: sky `#241c29` → `#382634` → `#4d2f38`; moon `#f7d9bf`; clouds `#4a3644`; hills `#5b3a3e`, `#4a3036`, `#3a252c`; stars `#f7e6d6` at 0.9.
- **Desktop, 32 icons,** column by column from the top left (7 a column at 1280, 8 at 390): Sticky Notes, Browser, Notepad, Terminal, File Manager, System Monitor, Snipping Tool, Calculator, Clock, Calendar, Image Viewer, Media Player, Code Editor, Diff, Paint, System Log, Hollow, Docs, CAD, Slides, Sheets, PDF, LibreOffice Base, LibreOffice Calc, LibreOffice Draw, Firefox, LibreOffice Impress, LibreOffice Math, Text Editor, LibreOffice, LibreOffice Writer, XTerm. Stroke glyphs; the ten Linux apps (brand art today) get the same tile with a neutral glyph, never brand art.
- **Taskbar:** `Start`; `Search` (title `Search (Ctrl+K)`); no task; pips `1` (current) `2` `3` `4`; `CPU 5%`, `RAM 5.0/15.2 GB`; volume; the bell, nothing unread; `17:38` over `Thu, 12 Nov`.
- **Start head and search:** the hourglass, `ImbatranimOS`, `Signed in`; search placeholder `Search apps and files`, focused.
- **`Pinned`** (6): File Manager, Terminal, Browser, Code Editor, Notepad, Settings.
- **A-Z list,** letter heads, each row a name and its full description:
- `B` Browser, `Browse the web through this machine`.
- `C` CAD, `2D drafting: DXF drawings, and DWG converted by the suite server, with a command line, object snaps and layers.`; Calculator, `Arithmetic, a scientific mode, and a programmer mode with bases + bitwise ops`; Calendar, `Month, week and agenda views, recurring events, reminders, ICS import/export`; Clock, `World clocks, stopwatch, timer, and alarms`; Code Editor, `Edit source files with syntax highlighting, tabs, and find/replace`.
- `D` Diff, `Compare two files side by side, edit and save the right one`; Docs, `Edit documents (docx)`.
- `F` File Manager, `Browse and manage files`. Nothing after File Manager (Firefox's line comes from its desktop entry, not in the repo): the pane ends there or mid-row. Nine rows in all.
- **`Recent`,** with `Clear recent files` (trash): `big.txt` `walk/big/big.txt`; `b.txt` `walk/b.txt`; `a.txt` `walk/a.txt`; `other.md` `walk/md/other.md` (page glyph); `body.json` `walk/body.json`; `fresh.txt` `walk/fresh.txt` (code glyph for all but other.md).
- **Session:** `Cover screen` (lock), `Log off` (log-out). **States:** a search with no match shows `Nothing found`; an empty Recent hides its block.

## 4. Directions

### A. Apricot, settled (Evolve today)
- **Idea:** today's Start and taskbar, finished: firmer edges and band steps, nothing under 11 px, descriptions in full, and one raised tile for an app wherever it appears.
- **Skeleton, 1280.** Taskbar 44 px on `surface-container-low` under an `outline-variant` hairline; `rounded-control` pills in today's order: Start, Search 32, tasks, pips 24, the two readouts, volume, bell, clock.
- **Start** floats 8 px off the bar and the edge: 384 × 740, `rounded-menu`, `shadow-menu`, a 1 px `outline-variant` edge, on `surface-container-low`. Today's bands in today's order: head (52 px on `surface-container`); search (`surface-container-lowest`, `outline` edge, 2 px `primary` ring); `Pinned` as 40 px tiles with names under; the A-Z list (flexes and scrolls; a 28 px tile, the name, the description wrapped in full, so CAD takes two lines); `Recent` at one 28 px line per file with the path right-aligned in muted ink; the session band on `surface-container`, `Cover screen` | `Log off` (hovers to `error-container`). With six one-line Recent rows the list gets about 245 px: Browser, CAD, Calculator and the top of Calendar, as today.
- **Desktop:** 80 × 96 cells, 40 px `surface-bright` tiles with `shadow-tile`; 11 px labels, two lines at most, broken only between words.
- **390:** taskbar 56 px: Start as the logo alone, Search, one workspace button showing `1` that opens the four as a menu, volume, bell, clock; 48 px targets; the readouts stay hidden. Start full width with 8 px gutters: the head and search stay pinned on top and the session band at the foot, and Pinned, the A-Z list and Recent scroll as one body between them (today's order; about five list rows on the first screen, Recent below), 48 px targets, 16 px search text.
- **Type:** Figtree 400-700 (today's); Inter stays the content face. By the app's names: label 11/15 (descriptions, paths, the date, icon labels; 600 for section labels), control 12/16 (rows, buttons, tasks), body 13/18 (search; the wordmark at 700; the clock at 600, tabular), title 17/22, headline 24/30. Phone: label 12/16, control and body 14/20, inputs 16. `text-micro` and `text-tiny` leave the shell.
- **Palette** (`--k-*`, light / dark; today's in brackets where it moves). surface `#fbf3ea` / `#1c1613` [`#1f1916`]; container-lowest `#fffdf9` / `#201a17`; container-low `#fdf7f0` / `#29211c`; container `#f4e6d7` [`#f6ebdf`] / `#322822`; container-high `#f0e1d2` / `#3c302a`; container-highest `#e9d6c3` / `#473932`; surface-bright `#fffdf9` / `#43362f`; on-surface `#33241b` / `#f6eadf`; on-surface-variant `#6b5141` / `#cdb6a5`; outline `#a2826b` [`#c4a58c`] / `#937a69` [`#6e5c50`]; outline-variant `#e0c8b2` [`#ead8c6`] / `#54443a`; error `#ba1a1a` / `#ff8a80` [`#ff7171`].
- **Accent:** today's. Light: strong `#a04b23` with white, soft `#f2a97e` with `#33241b`. Dark: strong is the pastel; **soft becomes a deep container per preset** (fill / text), pastel-edged when selected: Apricot `#5e3725` / `#ffdcc7`, Rose `#5c2a38` / `#ffd9e2`, Butter `#4f4019` / `#f8e6b5`, Sage `#2f4430` / `#d6ead2`, Sky `#23394f` / `#d5e6f7`. `high` keeps today's value: the four other deep shades fall to 4.33 on a deeper one.
- **Pre-checked** (light / dark): ink on low 14.0 / 13.4; muted on highest 5.2 / 5.7; strong on high 4.65 / 5.7; white on strong 6.0; outline on low 3.3 / 3.9; hairline on low 1.51 / 1.70; container on low 1.15 / 1.10; Start on the wall 1.11 with a 1.36 edge / 1.04 with a 1.78 edge; tile on the sky 1.16 plus shadow / 1.42; taskbar on hill-3 2.46; labels on the hills 5.7-8.5 / 8.4-12.0; error-container pair 7.2 / 9.5; dark soft text 7.96-9.32 and its pastel edge 5.25-6.88; error on highest 4.58 / 4.84. Re-run `contrast.mjs` for all five presets.
- **Signature:** one tile. The raised 40 px tile with its warm shadow is the only resting thing with a shadow: the same object on the desktop, in Pinned and beside every list row.
- **Reference:** `apple`, for one move: the product rests on a surface under the one shadow while the chrome stays flat. Nothing of its palette, type or glass.
- **Reopens:** `ui-conventions.md` rule 14 (the uppercase field label in the kit's `Input`, `Select` and Settings) and rule 12's 9-10 px shell chrome, both by the Floor.

### B. Start, opened wide
- **Idea:** Start gets the room its job needs: the whole A-Z list in a full-height pane beside Pinned and Recent, under one search band, with the account and the session in a foot band. Today shows about 3 A-Z rows at 1280; B shows all nine.
- **Skeleton, 1280.** A's taskbar and desktop. Start still opens from the button at the bottom left, now 704 × 740, `rounded-menu`, `shadow-menu`, A's edge. Head band 56 px on `surface-container-low`: the search, full width. Left pane 320 px on `surface-container` with a hairline edge: the A-Z list (Browser to File Manager), Solway letter heads that stick while their rows scroll, rows as A with full descriptions. Right pane 384 px on `surface-container-low`: `Pinned` as 48 px tiles with 12 px names, then `Recent` with its clear button and today's six two-line rows. Foot band 52 px on `surface-container`: the hourglass, the Solway wordmark and `Signed in` at the left; `Cover screen` and `Log off` as bordered buttons at the right.
- **390:** A's taskbar. Start becomes a full-screen sheet above the bar, edge to edge, top corners rounded: the search sticky on top, then Pinned, Recent and the A-Z list; the foot band sticks above the taskbar; 48 px targets. The order is deliberate: like Android's app drawer and Windows 11, what you reach for (pins, recent files) comes first and the full list starts one scroll down, so the 390 frame shows the pins and the six files, not the list.
- **Type:** Solway 700 as the display face, where it reads: the wordmark 15/18 (taskbar and foot band), the A-Z letters 16/20 in `primary`, page titles 24/30. Figtree for everything else at A's scale. Solway is static on Google Fonts: one vendored woff2; Hallmark's catalog check is clear. A new `--k-font-display` resolves to Space Grotesk in Classic.
- **Palette:** A's values. Pane on panel 1.15 / 1.10 plus the hairline 1.31 / 1.55; `primary` letters on the pane 4.86 / 7.35.
- **Signature:** the open list. Every app named and explained in one tall pane with Solway index letters, while Pinned and Recent sit beside it, not on top of it.
- **Reference:** `raycast`, for one move: search across a list pane, closed by a foot bar of actions. Nothing of its black canvas, Inter or red.
- **Reopens:** `decisions-themes.md` 2026-11-02, "the taskbar, Start button and menu, tray and desktop icons stay where they are", and brief 88's must-not-touch list. The opening is the 2026-11-06 entry, "Start's contents follow current desktops, not Windows 7". B keeps the button, the anchor and every item; it changes the menu's size and arrangement, and covers more of the desktop while open. Rules 14 and 12 as A.

## 5. Registry lines

| imbatranimOS (A) | Apricot, settled | Figtree (today's) | Figtree (today's; Inter for content) | apricot rust `#a04b23` / pastel `#f2a97e`, one of five presets (today's; satchel's clay family) | bottom taskbar (Start pill, search, tasks, pips, two readouts, clock); a 384 px floating Start of bands (head, search, pinned tiles, A-Z list, one-line Recent, session); one raised tile on desktop, pins and rows; phone: logo-only Start, one workspace button, full-width Start |
| imbatranimOS (B) | Start, opened wide | Solway (wordmark, A-Z letters, page titles) | Figtree (today's; Inter for content) | apricot (today's; satchel's clay family) | A's taskbar and desktop; a 704 px two-pane Start: search band, a 320 px A-Z pane at full height, Pinned and Recent beside it, account and session in a foot band; phone: full-screen Start sheet, pins and Recent first, sticky foot band |

## 6. Questions for the owner (ask sticky) and notes

1. **Docs, Sheets, Slides and PDF (and every add-on) take the kit's tokens through `kit:sync`.** Whichever direction wins changes for them too: sentence-case field labels in the kit's `Input` and `Select`, no 9-10 px chrome text, firmer outlines and hairlines, the deep dark selection for all five presets, dark ink on the dark destructive button, and with B a Solway display token. Inherit these now, or hold the kit changes until their own direction?
2. **B makes Start two panes, 704 px wide, with the account and session in a foot band.** That reopens the locked Start menu. Welcome, or does Start stay one 384 px column (A)?
3. **Approve a direction:** A or B?

- **Sketchers:** Floor 11 (no hand-drawn OS window) and Floor 14 (a capped container) don't apply in app scope: the OS chrome is the product and a desktop is full-bleed. Lint with `--scope app`; if the linter still fires on either, report it with that reason rather than reshaping the screen. Solway is confirmed on Google Fonts (static 300-800, latin).
- **B's font file** is its one new dependency; its reason is the wordmark and the index letters.
- **Classic** takes the winner's structure and Floor fixes, and its outline moves to 3:1 (`#86868b` / `#6c6c74`); its other values stay.
- **The single workspace button** is phone-only, under 600 px.
