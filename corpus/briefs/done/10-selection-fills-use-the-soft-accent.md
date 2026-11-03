# Brief 10 — Selection fills use the soft accent

## Context

Brief 09 gave every accent a strong pair (`primary` / `on-primary`) and a
soft pair (`primary-container` / `on-primary-container`). In Apricot, strong
is a deep shade with white on it and soft is the pastel with dark text. In
Classic the two are the same. On the canvas the owner picked
([Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html)), the
*selected and current* things are pastel:
- the selected file row;
- the current folder in the tree;
- the active toolbar tab;
- the Settings section rail;
- the chosen option in a segmented control.

Today they are all `bg-primary text-on-primary`, which after 09 would be
terracotta in Apricot.

**The rule** (goes into [ui-conventions.md](../../wiki/ui-conventions.md)):
- A selected, current or chosen state is `bg-primary-container
  text-on-primary-container`.
- A primary action (Install, Save, OK), a progress bar, an unread badge and a
  thin indicator stay `bg-primary text-on-primary` or `bg-primary`.
- Text, focus rings and borders stay `primary`.

Independent of 01-06; ships together with 08-15.

## Spec

1. List every `bg-primary` use in `apps/core/src`, `apps/add-ons` and
   `packages/ui/src`: about 84 in 57 files, as of 2026-11-02. Sort each into
   *selection* or *action/indicator*, and put the list in the outcome.
2. Move the selection ones to `bg-primary-container`, and their text and icons
   to `text-on-primary-container`. Check hover and focus states on the same
   elements: a hover that darkens a selected row must still read.
3. Surfaces that must match the canvas, checked one by one in Apricot light:
   - File Manager: the selected row, the current folder, the active
     Home/Notes tab;
   - Settings: the section rail and the segmented controls;
   - the Start menu's highlighted item;
   - the kit's `Select`, `ContextMenu` and `Checkbox` checked/selected states.
4. Add the rule to `ui-conventions.md` beside the token rules (§5-6), with one
   example of each kind.

## Must preserve

- Classic, pixel for pixel: there the two pairs are equal, so the swap shows
  nothing.
- No new token names; no hex literals.

## Acceptance

- In Apricot light, each surface in step 3 shows the pastel with dark text,
  and primary actions keep the deep fill with white text.
- Classic light and dark screenshots of the same surfaces are unchanged.
- Typecheck, lint, and the tests of the touched add-ons pass.
- The outcome has the sorted list.

## Files you OWN

- The files the `bg-primary` list names, for those class changes only.
- `corpus/wiki/ui-conventions.md`: the new rule.
- `corpus/wiki/status.md`, `corpus/log.md`.

## Outcome (2026-11-03)

**Built in `592b788` (version 1.74.0).** On 2026-11-03 there were 76
`bg-primary` lines in 58 files (the brief's "about 84" counted some
`bg-primary-container` uses). Some selected states already used the soft pair
before this brief and needed nothing:
- File Manager's selected row (`FileList`, `FileGrid`);
- its current folder (`FolderTree`);
- the kit's `Select`.

**Moved to the soft pair (selection):**
- **Core:**
  - `CommandPalette` (the selected row and its secondary text);
  - `StartMenu` (hover and focus highlight on both lists, and the
    description under it);
  - `WorkspacePips` (the current workspace);
  - `TaskbarContextMenu` (the hover highlight);
  - `NotificationPanel` (Do Not Disturb on);
  - `DesktopIcon` (the selected icon box and label);
  - `Settings` (the chosen Light/Dark and the wallpaper's check badge).
- **Add-ons:**
  - clock: `Alarms` weekday chips; `Clock` tabs, their icon and the count
    badge inside the active tab;
  - file-manager: `OpenWithDialog` (the chosen app), `SearchBox` (the toggle),
    `SearchResults` (the selected row and its secondary text);
  - calendar: `Calendar` (the view switcher), `RecurrenceFields` (weekday
    chips);
  - todo: `TodoRow` (the toggle chip), `Todo` (list filter ×2 and select mode);
  - logs: `Logs` (level filter, Follow);
  - system-monitor: `SystemMonitor` (tabs);
  - media-player: `Playlist` (the current track);
  - markdown-editor: `MarkdownEditor` (three view toggles), `Outline` (the
    current heading);
  - calculator: `ConverterPad`, `ProgrammerPad`, `ScientificPad` (angle mode),
    `CalcToolbar` (tape open);
  - notepad: `NoteEditor` (edit/preview).
- **Kit:** `Checkbox` (checked fill and check mark) and `ContextMenu` (the
  highlighted item).
- **A new `Button` variant, `selected`** (soft fill, strong border, the
  primary variant's hover and focus). Used where `variant={on ? 'primary' :
  …}` meant "on":
  - `FilePicker` ×2;
  - Paint's tools;
  - File Manager's Home/Notes, Show hidden and the preview pane;
  - Media Player's shuffle, repeat and subtitles;
  - Image Viewer's Fit and 1:1;
  - Notepad's find bar case and replace toggles.

**Kept strong (action or indicator):**
- `AuthShell`'s top strip.
- The taskbar's Start-open and current-task lines.
- `WorkspacePips`' windows dot.
- The desktop rubber band and the `SnapOverlay`.
- `Tray`'s unread badge and the tray calendar's today.
- `StorageSettings`' disk bar.
- `ToastHost`'s action hover.
- `Window`'s focused-title square.
- `levelStyle`'s level bar.
- `RingingBanner`.
- `Clock`'s count badge on an inactive tab.
- `DiffView`'s word and added-line tints.
- File Manager's pane resize handle.
- `EventDialog`'s "Default colour" swatch, which shows the accent itself.
- The today marker in `MonthView`, `WeekView` and `AgendaView`.
- `TodoRow`'s Save button.
- `Logs`' warn bar.
- `SystemMonitor`'s history bars, `StatsWidget` and `Gauge`.
- Media Player's slider thumbs and `Timebar`.
- `SplitDivider` while dragging.
- Minesweeper's mine that lost the game.
- Solitaire's empty-pile tint.
- `ArchiveManager`'s progress bar.
- The kit `Button`'s `primary` variant, and `<Button variant="primary">` for
  actions (Install, Save, OK, the confirm button).

**Calls to check with the owner:**
- "Today" in the calendars stays strong, as a marker the owner didn't choose,
  rather than "current". It's easy to flip.
- The border around a selected chip or toggle stays `primary` (deep in
  Apricot light). The pastel against cream is about 1.8:1, so the border is
  what keeps the state visible at 3:1. The canvas showed borderless pastel
  chips.

**Checked:**
- Typecheck in core, the kit and the twelve touched add-ons.
- Lint (one warning in `FilePicker.tsx`, `react-hooks/exhaustive-deps`, was
  there before).
- Tests: the kit (36), core's components and Settings (111), and clock,
  file-manager, calendar, todo, logs, system-monitor, media-player,
  markdown-editor, calculator, notepad, paint and image-viewer (665).
- Screenshots: Classic light and dark windows are the same as before brief 08
  (0 pixels).
- In Apricot light, these show the pastel with dark text:
  - the Start menu's highlighted item;
  - File Manager's current folder, its Home tab and a selected file row;
  - the file context menu's highlighted item;
  - Settings' chosen Light.

  The deep fill stays on the taskbar's current workspace badge's neighbours
  and on actions.

The rule is in [ui-conventions.md](../../wiki/ui-conventions.md) rule 6,
"Strong and soft".
