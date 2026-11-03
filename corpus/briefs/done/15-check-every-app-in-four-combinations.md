# Brief 15 — Check every app in the four combinations

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
every app, add-on, kit app and imbatranim-office app has to work in four
combinations: Apricot and Classic, each light and dark. Briefs 08-14 changed
the tokens, accents, selection fills, font, corners, wallpapers and Settings.
This brief walks everything once, fixes what broke, and brings the rules and
status pages up to date. It is the last of the theme briefs; 08-15 deploy
together after it.

Independent of 01-06.

## Spec

1. **Walk** every built-in app and add-on in Apricot light, Apricot dark and
   Classic dark. Classic light was covered by the earlier briefs' unchanged
   screenshots. For each, check:
   - text and icons readable;
   - focus rings visible;
   - selection uses the soft fill (10);
   - nothing clipped by Figtree (11);
   - no stray square or rounded corner (12).

   Use short targeted walks, not a full crawl.
2. **Non-DOM surfaces** that read colours from the appearance contract or CSS
   variables:
   - the Terminal's xterm palette (`repl-interpreter/src/lib/xtermTheme.ts`
     keeps an ANSI-16 palette per mode, checked for contrast; check it on
     Apricot's surfaces);
   - the Code Editor;
   - Snipping Tool's overlays.

   Fix contrast gaps in place.
3. **Fix** what the walk finds, one commit per app where it's more than a
   line. A problem that is a design question goes in the outcome for the
   owner, not into a guess.
4. **Rules and docs**:
   - `ui-conventions.md`: the identity line (§ top: "B&W tokens + ONE accent
     (crimson), dark-first, zero border radius") and rules 6-9 and 11 now
     describe themes, modes, the strong/soft accent, the token radii and the
     per-theme font. The pre-flight checklist asks for a check in Apricot
     light and Classic dark, not just "light".
   - The design-token comment at the top of `index.css`.
   - `status.md`.
5. **Other repos** (note, don't edit): imbatranim-office's apps and Hollow
   build against a snapshot of `packages/ui/src`. Until they re-vendor it,
   they keep:
   - a literal Space Grotesk;
   - `primary-container` on the strong accent;
   - no radius tokens.

   They will look Classic-shaped inside Apricot. List what a re-vendor needs
   in the outcome as an owner step, along with the office pin to move.

## Must preserve

- Classic as it was before 08, apart from fixes to real bugs the walk finds
  (name each).
- Token names and the add-on contract.

## Acceptance

- Every built-in app and add-on is listed in the outcome with its result in
  the three combinations walked, and every fix is named.
- `ui-conventions.md` describes themes and modes, and its checklist covers
  both.
- Typecheck, lint, and the tests of the touched packages pass. The full
  cross-workspace suite and long e2e runs are not part of this brief.
- Owner steps in the outcome: deploy 08-15 together, retake the docs
  screenshots (`docs/images/shots.md`), and re-vendor the kit in
  imbatranim-office and Hollow.

## Files you OWN

- Any app or add-on file, for theme fixes only.
- `corpus/wiki/ui-conventions.md`, `corpus/wiki/status.md`, `corpus/log.md`.
- The comment block at the top of the tokens in `apps/core/src/index.css`.

## Outcome (2026-11-03)

**Fixes:**
- `26afbcb` (1.84.0) rounds the apps' own chips, tabs and toggles.
- `b91f1ce` (1.85.0) holds the Terminal's ANSI palettes on Apricot's surfaces
  in its tests.
- `b45a1e9` (1.86.0) rewrites the design-token comment.

The rules and docs are in this record's corpus commit.

**The walk.** It ran on the host stack from brief 08's recipe, in headless
Chrome at 1280×800, against a scratch home and database. A script set the
theme and mode through `PUT /api/prefs` and reloaded. It opened each app alone
from its desktop icon (Settings from Start), waited 2.5 s (8.5 s for the Code
Editor), shot the window element and closed it. The screenshots were reviewed
as contact sheets.

Each app was seen at its opening view: empty states, nothing opened. Deeper
states (an open document, dialogs, a running game) were not walked. Sticky
Notes has no window and no notes existed, so only the desktop was seen.
Marketplace kit apps weren't installed on the scratch machine.

| App | Apricot light | Apricot dark | Classic dark |
|---|---|---|---|
| Todo | ok; chips square → fixed | ok | ok |
| Bookmarks | ok | ok | ok |
| Browser ("not set up" notice) | ok | ok | ok |
| Notepad | ok | ok | ok |
| Terminal | ok (cream surface, ANSI checked) | ok (dusk surface) | ok |
| File Manager | ok; list rows square (table) | ok | ok |
| System Monitor | ok; tabs square → fixed | ok | ok |
| Snipping Tool | ok | ok | ok |
| Calculator | ok; mode toggles square → fixed | ok | ok |
| Clock | ok; tabs square → fixed | ok | ok |
| Calendar | ok; view switch square → fixed | ok | ok |
| Image Viewer | ok | ok | ok |
| Media Player | ok | ok | ok |
| Markdown Editor | ok; toggles square → fixed | ok | ok |
| Code Editor | ok (Monaco `vs` / `vs-dark`) | ok | ok |
| Diff | ok | ok | ok |
| Minesweeper | ok | ok | ok |
| Solitaire | ok | ok | ok |
| Paint | ok | ok | ok |
| Git | ok | ok | ok |
| REST Client | ok | ok | ok |
| Archive Manager | ok | ok | ok |
| System Log | ok; chips square → fixed | ok | ok |
| Settings | ok | ok | ok |

"ok" means:
- text and icons readable;
- selections and chosen options on the soft fill;
- actions, progress fills and badges in the strong accent;
- nothing clipped by Figtree;
- window, menu and control corners as the tokens say.

**Fixes made:**
- `26afbcb`: `rounded-control` on hand-built option controls:
  - Clock's tabs and alarm chips;
  - File Manager's search toggle;
  - Calendar's recurrence chips and view-switch container;
  - Todo's chips;
  - Logs' filter and Follow;
  - the Calculator's toggles and toolbar keys;
  - System Monitor's tabs;
  - Markdown Editor's toggles;
  - Notepad's edit/preview;
  - the notification panel's Do Not Disturb.

  All 0px in Classic, so Classic doesn't change.
- No Classic bug turned up, so nothing in Classic changed apart from that
  0px-in-Classic commit.

**Non-DOM surfaces:**
- **Terminal:** `xtermTheme.ts` reads `--k-surface`, `--k-on-surface` and
  `--accent`, so it took Apricot's surfaces with no change. Every ANSI colour
  clears the tests' 3:1 on Apricot's cream (lowest: bright yellow, 3.78) and
  dusk (lowest: magenta, 5.9). The cursor is 5.4:1 in light and 8.9:1 in
  dark. The tests now cover both themes' surfaces.
- **Code Editor:** Monaco uses its built-in `vs` / `vs-dark` in both themes,
  a white or `#1e1e1e` editor inside a cream or dusk window. It's readable,
  so it's left as is (see the questions below).
- **Snipping Tool:** its overlays are a fixed dark scrim with white text, the
  same in every theme. The annotation field's border uses `--accent`, and its
  text uses `--font-ui` (brief 11).

**Rules and docs:**
- `ui-conventions.md`:
  - the identity line names the two themes and their modes;
  - rule 6 describes per-theme presets;
  - rule 7 describes the four token blocks and the `apricot:` variant;
  - rule 11 describes the per-theme UI font;
  - checklist item 5 asks for a check in Apricot light and Classic dark;
  - rules 8 and 9 were rewritten in brief 12 and the strong-and-soft rule
    added in brief 10.
- `routing.md`'s identity lock points at the themes.
- The token comment in `index.css` is rewritten.
- `status.md` is updated.

**Questions for the owner** (design calls, not guessed):
1. Should the Code Editor (and Diff) get a Monaco theme drawn from the tokens,
   so it sits on Apricot's surfaces instead of white or `#1e1e1e`?
2. List rows stay square in Apricot: File Manager's table, search results, the
   playlist, the outline, the palette. The canvas shows rounded, inset rows.
   File Manager's would mean leaving `border-collapse`.
3. Toasts, tooltips, tray popovers and the sign-in card keep their black
   shadows in Apricot. Use the warm ones?
4. Bordered content boxes inside windows (Settings' section icons and Apps
   rows, Snipping Tool's capture options, cards in other apps) stay square, by
   rule 9's "in-window content is flat". Round them too?
5. From brief 10: the calendars' today marker stays the strong accent, and a
   selected chip keeps its deep border.
6. A few controls show the browser's default focus outline instead of the
   accent ring: Snipping Tool's capture options, the Calculator's mode tabs,
   Archive Manager's close button. It looks the same in every theme and was
   there before the theme briefs.

**Other repos** (noted, not edited). imbatranim-office's five apps and Hollow
build against a snapshot of `packages/ui/src`. Until they re-vendor it they
keep:
- a literal Space Grotesk (`--font-ui` in the snapshot);
- `primary-container` mapped to the strong accent;
- no radius tokens and no `selected` Button variant, so their kit components
  stay square.

Inside Apricot they will look Classic-shaped, in Apricot's colours.
`system.appearance.get().accent` is now always a hex (brief 08). Any of their
code that compared it to an accent id would need a look.

**Owner steps:**
1. Deploy 08-15 together: vps-deploy's rollout of imbatranimOS. Nothing was
   deployed from this run. On the first start, the owner's machine moves to
   Apricot light, keeping its old accent and wallpaper as Classic's.
2. Retake the README images per `docs/images/shots.md`. They show Classic
   dark.
3. Re-vendor `packages/ui/src` into imbatranim-office and Hollow, then rebuild.
   Then move the pins in `marketplace/imbatranim-office.json` (`909c321`) and
   `marketplace/hollow.json` (`0d83f70`) to the new commits.
4. When merging `claude/linux-apps-layer` (briefs 01-06), expect conflicts on
   the version bump, `corpus/log.md` and `corpus/wiki/status.md`.
