# The redesign: "Start, opened wide"

This folder is the design record of imbatranimOS's redesign. The estate redesign board, where it was drawn and approved, is a private canvas; this is a copy of the app's page on it plus the build behind that page. The owner approved it on 2026-11-13, and [brief 88](../../corpus/briefs/done/88-a-redesign-with-hallmark-on-the-estate-board.md) built it. The code is now the source of truth: where the app and these files differ, the app wins, and later work may have moved a screen on. Read this folder to see what was decided and why before reshaping a screen.

## The owner's decisions

The owner approved the whole board on 2026-11-13, with every question standing at what the board proposed unless they reopened it. The questions this app's page asked:

- **Ask:** 1. B reopens the locked Start. It becomes a 704 px two-pane menu, and at 1280 it covers the desktop icons while it is open. decisions-themes.md, 2026-11-02, says the taskbar, Start button and menu, tray and desktop icons stay where they are. The button, the anchor and every item stay. Welcome, or does Start stay one 384 px column (A)? 2. Docs, Sheets, Slides, PDF and every kit app take these changes through kit:sync: sentence-case field labels in the kit's Input and Select, no 9 to 10 px chrome, firmer outlines and hairlines, a 10 px control radius, the deep dark selection for all five accent presets, dark ink on the destructive button (on-error #2b0d0d in dark is 7.9:1, white is 2.7:1 today), and a Solway display token. Inherit now, or hold the kit changes until each app has its own direction? 3. Approve B, Start opened wide, or A, Apricot settled?
- **Reopened:** Recorded (decisions-themes.md, 2026-11-02): "The Windows-7-classic layout is not revisited: the taskbar, Start button and menu, tray and desktop icons stay where they are, and every way of finding things stays the same." Opened on 2026-11-06 ("Start's contents follow current desktops, not Windows 7"; the owner: "we are not stuck with win7 style"). Proposed: the button, the bottom-left anchor, the search, pins, A-Z list and Recent all stay; only the menu's size and arrangement change. Brief 88's must-not-touch list names the skeleton "unless the owner reopens one on the board".
- **Reopened:** Recorded (ui-conventions.md, rule 14): the house field label is uppercase, tracked, 11 px (ui/Input.tsx, ui/Select.tsx, Settings.tsx), and rule 12 keeps nano, micro and tiny sizes in the shell. Proposed: field and group labels are sentence case, untracked, 11 px at weight 600 (Hallmark Floor 9); nothing in the shell is under 11 px, or 12 px on a phone. Tracked capitals such as PINNED, RECENT and IMBATRANIMOS go with it.

Where the files below disagree, the later layer wins: the owner's decisions, then the controller's rulings, then the judges' rulings, then the directions file.

## What is here

| Path | What it holds |
|---|---|
| `directions/imbatranimOS.md` | The director's brief: both directions (the winner is the one built), the shared fixture and the screens to draw. |
| `judge/imbatranimOS/RESULT.md` | The blind judging against today and the rulings that came with the win. |
| `critiques/imbatranimOS-controller.md`, `critiques/imbatranimOS.md` | The design critic's review against today, and the controller's rulings over it. |
| `manifests/imbatranimOS.tokens.css`, `manifests/imbatranimOS.tokens-map.md` | The token hand-off in the app's own names, and the renamed, new and unused tokens. |
| `manifests/imbatranimOS.board-notes.md` | What the board said beside the screens: the asks, decisions, reopened rules, open questions, the contrast table and the runner-up. |
| `work/imbatranimOS/twins/*.html` | Each drawn screen as static HTML, light and dark: open one in a browser. |
| `work/imbatranimOS/shots/` | The twins rendered at 1280 and 390, light and dark, WebP. `direction.webp` is the board's direction sheet. |
| `shots/imbatranimOS/` | Today's screens as the board showed them before the redesign. |

People's names and data in the pictures come from seeded demo accounts or are invented.

## Not here

The sketches and the judges' images, the runner-up's build (its notes are in the board's notes), the build's scripts, and the screenshots taken while it was built. They stay in the estate build folder.
