fix

# imbatranimOS redesign, critic's findings (2026-11-13)

I looked at the screens first and read the manifest and the rulings after. B holds up. Start finally has room for its job, and every island today had is still there: Start's foot band, the window title and foot bands, the sign-in head band, raised tiles on the hills. What's owed is two regressions with clear causes, a phone desktop that hides a row of apps, and a few state and dark fixes.

Not findings: the numbered dots at 1280 are the board's callouts. The white band under the 768x1024 render and the missing taskbar in the 1024x768 render come from the twin's fixed `.os{height:800px}`, see issue 3.

## First screens, today against the build

| Screen, size | Today | Build |
|---|---|---|
| Start 1280x800 | 6 pins; Browser, CAD and Calculator, then the top of Calendar, CAD and Calculator cut with an ellipsis; 6 recent, paths about 9 px; clock in view | 6 pins; 9 apps whole with full descriptions, Firefox peeking under a fade; 6 recent; clock in view; panel covers every icon column, ruling 5 |
| Start 390x844 | 6 pins; Browser whole, CAD, Calculator and Calendar cut; 6 recent; no clock, the bar runs off the edge | 6 pins; 6 recent, path beside the name; B head and Browser whole, CAD's name peeking; clock in view |
| Start 360x800 | no capture | as 390, Browser ends 10 px above the foot band; clock in view |
| Desktop 1280 | 32 icons, two-line labels | 32 icons, one-line labels where they fit |
| Desktop 390x844 | 32 icons; no clock | 32 icons; clock in view |
| Desktop 360x800 | no capture. Derived from `layoutIcons.ts`: 7 rows, so a fifth column of 4 icons starts at x 336 and runs off the edge | 8 fixed rows of 96 px in 744 px: row 8's labels, Calculator, System Log, LibreOffice Calc and XTerm, go under the taskbar |
| Settings 1280 | Theme, Mode, 4 accent chips cut by the window foot | Theme, Mode, all 5 accents, 3 wallpapers, Apps heading peeking |
| Settings 390 / 360 | 390: Theme, Mode, 3 accent chips cut; no clock. 360: no capture | full screen: Theme, Mode, 5 accents in two rows, 3 wallpapers, Apps; clock in view |
| Sign-in, all sizes | the whole task | the whole task; on the phone the card sits 96 px from the top, clear of the keyboard |

The phone A-Z showing one app where today showed four, three of them cut, is the cost ruling 1 accepted, and so is Start covering the desktop at 1280. Neither is a fix.

## The builder's five choices

1. **B standing in for A.** Right. The fixture has no A app and inventing one breaks "nothing invented". Ruling 1 means the first letter. Keep.
2. **The name-only Firefox row as the scroll cue.** Keep. Firefox really is the next app after File Manager, its line lives in its desktop entry, and only the top of its name shows under the fade, beside the scrollbar edge. Its globe glyph is the problem, see regression 1.
3. **The phone foot band without the wordmark and `Signed in`.** No. What's left is a white hourglass tile 50 px above the lit hourglass Start button. It looks like an app tile and does nothing. Issue 2.
4. **Settings filling the phone above the taskbar.** Right. That's how Android apps open, it shows the whole Appearance task where today cut Accent, and the 48 px title band keeps minimise and close. Keep.
5. **Sticky letter heads at `top:-1px`.** No harm to the user, but it dodges the lint. Gate 56 counts `top:0` stickies. `.head` sits outside the scroller at both widths and each head lives in its own `section.grp`, so only one sticks at a time and 56 is a false positive. Set `top:0` and record `/* Hallmark · waive 56 · one scroller, each letter head inside its own section, one stuck at a time */` beside 39b, 72 and 80. The Floor sticky should then say waived, not passed.

## Regressions against today

1. **Desktop and Start, the Linux apps lost their identity.** Both themes, all widths. Today Firefox, XTerm, Text Editor and the LibreOffice set wear their own art, so Firefox and Browser, Calc and Sheets, Impress and Slides part at a glance. The build reuses the web apps' glyphs, per `screens.mjs`. Firefox and Browser are the same globe, and so is the Firefox peek in Start. XTerm and Terminal share a prompt, LibreOffice Calc and Sheets a grid, Impress and Slides an easel. Notepad, Docs, Text Editor and LibreOffice Writer are four copies of one page. Notepad and Docs already looked alike today, but the other pairs are new. "Never brand art" comes from the direction file's fixture. It isn't one of RESULT.md's eight rulings, I found nothing on it in the repo's `corpus/wiki/decisions*.md`, and the repo has no DESIGN.md or PRODUCT.md, yet the desktop sticky tags it `[ruling]`. Fix: put it on the ask sticky as an owner call, today's icons from the desktop entries or stroke glyphs. If stroke glyphs stay, give every app its own Lucide glyph from the OS's set: Firefox `flame`, XTerm `square-terminal`, LibreOffice Calc `sheet`, Impress `presentation`, Writer `file-pen-line`, Text Editor `file-type`, Docs `file-text`, Notepad `notebook-pen`.
2. **Settings, the Theme and Wallpaper cards lost their edge and their selected ring.** Both themes, all widths. Today every theme card has a hairline and the chosen one an accent edge. The build asks for `inset 0 0 0 1px outline-variant` on `.thm .pv` and `.wall`, and 2 px `accent-soft-edge` on `.on`. An inset shadow paints under the children, though, and the preview and caption cover it. My pixel scan at 1280 finds no edge on any card. The Plain preview is #fbf3ea on the #fbf3ea window body, #1c1613 on #1c1613 in dark, so above its caption the card is invisible. Classic is #f8f8f6 on #fbf3ea, and #171719 on #1c1613 in dark. The chosen theme and wallpaper show only a 20 px check while Mode and Accent show a fill and a deep edge, so Mode reads as the most important setting. The settings sticky promises the deep edge. Fix: paint the edge above the content with `.thm .pv::after, .wall::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px var(--k-outline-variant);pointer-events:none}`, 2 px `accent-soft-edge` on `.on`, and `.wall{position:relative}`. The board's `proposed-settings-1280` and `-390` .dc.html carry the same rule, so fix them too.

Nothing else regressed. Search still opens focused with the strong ring, the bands, the pressed task underline, Recent with its paths and clear button, and the session buttons all carry over.

## Priority issues, ranked by cost to the user

1. **The phone desktop hides a row of apps.** 360x800 in both themes, and any phone where the browser bars eat height. Today's `layoutIcons.ts` exists because a fixed eight-row grid once hid rows 6-8, "and with them the only way to launch those apps". The comp's `grid-template-rows:repeat(8,96px)` brings that back, and the Floor sticky's "no overflow at 360" is wrong. Fix: under 600 px, a cell stride of 88 px (8 top, 40 tile, 4 gap, two 16 px label lines = 84). Eight rows then take 16 + 8 x 88 = 720 of the 744 px. Count rows from the measured height as `layoutIcons` does, and past that let the phone desktop scroll vertically, never under the bar. Don't drop the second label line.
2. **The phone foot band's lone tile.** 390 and 360. Ruling 6 keeps the account in the foot band, so give it back its words instead of a bare logo. I measured this in a scratch copy of the twin. Show `Signed in` at 12/16 in `on-surface-variant` beside the 32 px tile, and size Cover screen and Log off to their content with 12 px side padding. At 360 the row runs: tile 12-44, words 52-102, Cover screen 110-244, Log off 252-348. Nothing overflows, both labels stay whole, the band keeps its height, and Browser's row stays whole above it.
3. **Start and windows are sized for an 800 px screen.** `.start{height:740px}` anchored 52 px above the bar needs 800 px. Derived from the CSS, not a capture: on a 1366x768 laptop the top 24 px of Start, search band included, would sit past the screen edge. `.win{height:724px}` has the same problem. Fix: `.start{height:min(740px,calc(100svh - 60px))}`. The A-Z pane already scrolls. When the height runs short, let the right pane scroll too, rather than squeezing Recent's two-line rows, so no row is ever cut. Clamp the window the same way. In the twin, set `.os{height:100svh;min-height:600px}` at every width so the 768 and 1024 renders show the real screen.
4. **Dark accent swatches show the wrong colour.** Settings, dark. The swatch paints `--accent-*-soft`, which in dark is the deep container, so Butter is olive #4f4019, Sky navy #23394f and Sage #2f4430. They look disabled, and none matches the accent the user then sees on rings, A-Z letters and glyphs. Fix: paint each swatch with the preset's pastel in both modes, Apricot #f2a97e, Rose #eea6b5, Butter #f3d27a, Sage #a9c9a4, Sky #a7c7e7, with the check in #33241b. Leave the chip's selected deep fill and pastel edge as they are.
5. **The dark Settings window sinks.** Its body is `surface` #1c1613, the darkest token, under its own #322822 bands and under the #382634 dusk wall, so the window reads as a hole. Start's body is `container-low` #29211c, so the two floating layers sit at different heights. Fix: one body role for every floating layer in both modes, `container-low`: #29211c in dark, #fdf7f0 in light, which barely moves from #fbf3ea. Move unselected Mode and Accent controls up to `container` #322822 in dark, and let the edge fix from regression 2 frame the Classic preview. This departs from the direction's palette, where `--k-surface` is the window body and every kit app inherits it, so it's a controller or owner call, and `contrast.mjs` has to be re-run.
6. **The phone workspace button reads as a badge.** 390 and 360. A lone `1` in a soft square, beside the volume and bell icons, looks like an unread count. Fix: four 4 px dots under the numeral inside the 34 px fill, the current one in `accent`, the rest in `outline`. That says one of four without words, and the button still opens the workspace menu.

## Dark

It's designed, not inverted. Tiles lift by getting lighter: pin tiles are #43362f on the #29211c pane, desktop tiles the same #43362f on the dusk wall, the A-Z pane #322822 sits beside #29211c over a hairline, and the bands are #322822. Selection uses deep containers with pastel edges, the Dark mode button at #5e3725. The accent turns to the pastel #f2a97e for letters, glyphs and rings, and the moon replaces the sun. The surfaces separate in Start, the taskbar and sign-in, where the ground is #1c1613, the card #29211c and the head band #322822. The two misses are issues 4 and 5. Keep the label chips on the dark desktop, since at 390 they stop pale labels landing on the pale moon. Polish only: one 6 px radius and 2/6 px padding, so two-line chips read as soft blocks rather than the uneven slabs in `desktop-dark-390.png`.

## Strengths to keep

- The two-pane Start at 1280: nine apps with whole descriptions against today's three, two of them cut, the search band with its strong ring as the first thing the eye lands on, Solway letters on the tinted pane, and Pinned on raised tiles beside it.
- The phone taskbar holds the clock at 390 and 360 with 48 px targets. Today lost the clock at 390.
- Settings shows the whole Appearance task at both widths: all five accents and the wallpapers, where today cut Accent.
- Today's islands are all kept, with bands a tone off the body, floating layers on warm shadows, and the sign-in card's accent top edge. Nothing went flat.

## Heuristics, 28/40

1. Visibility of system status, 3: clock kept on the phone, CPU and RAM labelled, the pressed Start and task underline; the chosen theme and wallpaper are barely marked.
2. Match with the real world, 3: familiar OS words, and today's own "Cover screen".
3. User control and freedom, 3: minimise and close stay; clearing Recent shows a toast but offers no undo.
4. Consistency and standards, 2: four selected styles on one Settings page, five shared glyphs, a tile that looks like an app and does nothing.
5. Error prevention, 3: Sign in is disabled while empty; Log off is bordered and hovers to `error-container`.
6. Recognition over recall, 3: descriptions, pins and Recent on one screen; the shared desktop glyphs cost a point's worth.
7. Flexibility and efficiency, 3: search focused on open, Ctrl+K, pins, Recent; the phone's one workspace button adds a tap.
8. Aesthetic and minimalist design, 3: calmer bands, the dead `IMBATRANIMOS` strip gone; the phone foot tile and dark swatches are noise.
9. Error recovery, 3: "That did not work. Try again." and a Settings retry, plain but enough.
10. Help, 2: the A-Z descriptions are the only help, which is about right for a household OS.

Detector, on all nine twins with its parser modules resolved through a scratch copy:
- `cramped-padding` on root, `lw`, `recs`, `foot`, `tb` and `wfoot`: dismissed. A full-bleed OS frame, a scroll pane whose rows carry their own padding, and compact bands.
- `gpt-thin-border-wide-shadow` on Start, the Settings window and the sign-in card: dismissed. An edge plus lift on floating layers is today's strength 4.
- `flat-type-hierarchy` on Start (11-16 px) and the desktop (11-15 px): dismissed. A menu and a desktop at compact density, with Solway carrying the display.
- `codex-grid-background`: dismissed, it's today's dotted ground. `icon-tile-stack` on "Appearance" and "Apps": dismissed, the tile sits beside the heading, as today.
- `overused-font` Inter on Settings and sign-in: dismissed. It's today's content face on subtitles and hints, `font-content` in `AuthShell.tsx`, kept by the direction.
- Direction sheet, `tiny-text` x19 and `em-dash-overuse` x35: dismissed. The sheet has no em dash; the count is the `--k-*` token names, and the 11 px text is spec-table captions.

Don't trade back the open list while fixing: nine apps explained beside Pinned and Recent at 1280, and the clock on the phone taskbar, are what won.
