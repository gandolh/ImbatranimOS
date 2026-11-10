# Task 87: Base UI by the conventions

**Depends on:**

- In this repo: brief 85 (the pin) and brief 86 (the gate, the formatter, `.claude/rules/web.md`).
- In the owner's skills library:
  - brief 02, *A base-ui skill, styled with Tailwind*: rules 1-13, the references and `check-base-ui.mjs`;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: the checker runs `--warn-only` until this brief is done.
- The owner's grilling of 2026-11-10: Q15, Q16, Q18, Q40, Q41, Q44, Q57, Q58, Q62 (all below).

**Runs before:** 88. This brief changes structure, behaviour and the theme setting. Brief 88 then changes the look, so its before screenshots show the final structure.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

The owner's call of 2026-11-09 is Base UI everywhere at 1.9.0, styled with Tailwind v4, with the base-ui skill's conventions enforced in each repo. ImbatranimOS is **already on Tailwind v4**: `apps/core/src/index.css` imports `tailwindcss` (4.3.3 resolved) through `@tailwindcss/vite`, and `@source` lines scan the add-ons and the kit. So this repo has no Tailwind migration brief. This brief closes the gaps between its UI and the rules, and reconciles its own UI rules with the skill's.

What serves the app: Vite builds `apps/core` into static files, and the NestJS backend (`apps/backend`) serves the API from one image built from `infrastructure/Dockerfile`. There is no Fastify server.

### The two rule sets, side by side

The repo's rules are [wiki/ui-conventions.md](../../wiki/ui-conventions.md) (rules 1-46, derived 2026-07-31, refreshed 2026-11-03). The skill's are its rules 1-13. **Where the repo's rule is stricter, it wins** (the owner's standing instruction for this set). Each pair:

| Skill rule | Repo rule | Relation | Which wins |
|---|---|---|---|
| 1. Pin exactly | none | the repo has none; brief 85 adds it | skill |
| 2. Subpath imports | all 12 files already do it | agree | either |
| 3. Base UI only under a `ui/` folder | rule 1 (import only `@imbatranim/ui`, `lucide-react`, `react`, `@tanstack/react-query`; `@imbatranim/core` type-only) and rule 4 (a missing control goes into the kit, never a private copy) | **the repo is stricter**: an add-on or kit app imports no Base UI at all, and only `packages/ui/src/components/` and core's `shared/components/ui/` hold it | repo |
| 4. Tailwind on the parts, state attributes as variants | rules 5-9 (semantic token classes, no hex, no Tailwind palette colours, six token radii, shadow variables) | the repo adds a palette ban and token-only radii, which the skill's rule 6 only half covers | repo for colours, radii, shadows |
| 5. One stylesheet | the desktop's `apps/core/src/index.css` plus the kit's `packages/ui/src/theme.css` (shared by marketplace kit apps on purpose), plus `apps/add-ons/notepad/src/lib/highlight.css` (72 lines) | **conflict on count**; the token file is shared on purpose, and `highlight.css` is third-party-like syntax colouring | repo: two token files stay; `highlight.css` moves into `index.css` as a layer or an exception |
| 6. Semantic tokens only | rules 5, 8 | agree; the repo's token set is richer | repo |
| 7. Motion through state attributes, `motion-safe:` | none | the repo has no motion rule | skill |
| 8. Floating parts portalled, z-index from tokens | rule 40 ("never portal your own modal"), no z rule | agree on portals; **the repo has no z-index scale** | skill adds it |
| 9. A trigger around a component uses `render` | rule 42 (Tooltip around a Button nests buttons) | agree; **rule 42 is stale**: `packages/ui/src/components/Tooltip.tsx:15-19` already forwards `render` | skill; the wiki line is updated in step 9 |
| 10. Select passes `items` | rule 31 | agree; done once in the kit's `Select` | either |
| 11. No native dialogs | rule 43 | agree; `window.confirm/alert/prompt` greps to zero (`apps`, `packages`) | either |
| 12. Dialogs: Escape guard, `initialFocus`, `disablePointerDismissal` on forms, a Title, an `aria-label` on icon-only controls | rule 40 (use the kit `Dialog` to inherit Base UI's focus trap, Escape and backdrop dismissal), rules 37 and 21-22 | **conflict, in part**: rule 40 says outside-tap dismissal is inherited; Q58 (owner, 2026-11-10) says a dialog holding a form does not dismiss on an outside tap | owner's answer; rule 40 is revisited for form dialogs only |
| 13. Prefer Base UI over hand-built widgets | rules 4, 35-38 (real buttons, `aria-pressed`, roles) and rule 31 (a native `<select>` is wrong) | agree in spirit; the repo already names Tabs as missing | skill, with the exceptions below |
| theme rule (Q18): `@custom-variant dark` on `data-theme` | rule 7: **never add a `dark:` variant**; the token blocks carry all four theme and mode combinations | **conflict**; the repo's tokens already do what `dark:` would, and `grep "dark:"` finds 0 Tailwind uses | repo: no `dark:` variant; the switch is added (step 8) |
| type scale (Q62): a named scale in `@theme` | rule 12: explicit `text-[11px]`/`[12px]`/`[13px]` | **conflict**: 494 `text-[Npx]` lines in 102 files | skill: named sizes whose values are the same pixels (step 7) |
| root font size (Q44) | rule 12: root is 13 px (`apps/core/src/index.css:271`) | **conflict**; see step 7 | owner call, with the spacing fix |

### The audit (read 2026-11-10)

Commands are in step 1. The audit covers the 12 Base UI files, the kit, core and the 15 add-ons.

| Rule | Violations | Where |
|---|---|---|
| 1. Exact pin | 2 | `packages/ui/package.json:20`, `apps/core/package.json:19`; brief 85 fixes both |
| 2. Subpath imports | 0 | 12 imports, all subpaths |
| 3. Base UI only under `ui/` | **3** in core | `apps/core/src/shared/components/CommandPalette.tsx:2` (`/dialog`), `apps/core/src/shared/components/taskbar/Tray.tsx:3` and `TrayVolume.tsx:2` (`/popover`, 3 popovers: `Tray.tsx:86`, `Tray.tsx:169`, `TrayVolume.tsx:39`). The kit's 9 files sit in `packages/ui/`, which counts as a `ui/` folder. Add-ons import none (0 files) |
| 4-6. Tailwind on the parts, tokens | 3 | `packages/ui/src/components/Dialog.tsx:28` (`bg-black/50`, a palette colour the repo's rule 8 forbids); `apps/core/src/modules/marketplace/NativeAppHost.tsx:86`, `apps/core/src/modules/linux-windows/LinuxWindowBody.tsx:246` (`bg-black`, a Linux window's own surface: an exception to record); `apps/add-ons/browser/src/Browser.tsx:263` and `apps/add-ons/paint/src/Paint.tsx:660` (`bg-white`: a web page and a canvas, exceptions to record) |
| 5. Inline `style` | 83 `style={{` sites | computed geometry (window frames, the desktop layer); the audit's job is to confirm each is geometry or a runtime custom property, and list any that are not |
| 7. Motion keyed on state attributes | not measured | step 1 counts `transition`, `animate-` and `data-starting-style` uses |
| 8. Z-index from tokens | **15** literal `z-[N]`, 900 to 10001, no scale | `apps/core/src/modules/auth/AuthGate.tsx:134` (9999), `apps/core/src/shared/components/switcher/AltTabSwitcher.tsx:148` (10001), `TrayVolume.tsx:53`, `Tray.tsx:106, 183` (1000), `notifications/ToastHost.tsx:160`, `CommandPalette.tsx:129, 132` (900, 901), `packages/ui/src/components/Tooltip.tsx:30` (1100), `Dialog.tsx:28, 31` (1000, 1001), `ContextMenu.tsx:69` (10000), `taskbar/Taskbar.tsx:115`, `StartMenu.tsx:213` (9001), `Select.tsx:68` (1000). The Select popup (1000) sits below the Dialog popup (1001); step 4 checks that a Select inside a Dialog opens in front |
| 9. `render` on triggers | 1 | `Dialog.tsx:26` wraps `trigger` as a child of `BaseDialog.Trigger`; the Tooltip already passes (`Tooltip.tsx:15-19`) |
| 10. Select `items` | 0 | done in the kit's `Select` for every caller |
| 11. No native dialogs | 0 | |
| 12. Dialogs | **5 kit dialogs** | the kit `Dialog` (`packages/ui/src/components/Dialog.tsx:25`) has no Escape guard, no `initialFocus`, no `disablePointerDismissal`, drops the change reason in `onOpenChange`, and its close button (`:43`) is the text "×" with no `aria-label`. `PromptDialog.tsx:46` holds a text field and dismisses on an outside tap (form: Q58). `ConfirmDialog.tsx:41` is a plain Dialog, not the pending-state AlertDialog. `UnsavedChangesDialog.tsx:35` and `FileConflictDialog.tsx:33` guard a running save with `!saving`/`!busy` in the callback. `CommandPalette.tsx:123` has none of the three either. 9 files (10 sites) use `<Dialog` directly (`filePortal.tsx`, `OldDataNotice.tsx`, `ShortcutsOverlay.tsx`, Calendar's `EventDialog.tsx`, five File Manager dialogs) |
| 13. Hand-built widgets | **see below** | |

**Rule 13, what Base UI 1.9.0 now covers** (each is a hand-built control today):

1. **Tabs.** `apps/add-ons/calculator/src/Calculator.tsx:41` (mode tabs, `aria-pressed` buttons), `apps/add-ons/code-editor/src/CodeEditor.tsx:832` (`role="tab"`, file tabs, hand-built keys), and Clock's tabs (`apps/add-ons/clock/src/Clock.tsx:84`). [wiki/ui-conventions.md](../../wiki/ui-conventions.md) rule 4 already lists Tabs as "still missing" from the kit. Base UI's `Tabs` joins the kit.
2. **`aria-pressed` buttons: 32 sites** (`grep -rn "aria-pressed=" apps/core/src apps/add-ons/*/src packages/ui/src --include=*.tsx`, tests excluded). Per Q41 and Q57:
   - **A choice of one** becomes `RadioGroup` (a filter, a mode, a pick that saves nothing by itself): `ScientificPad.tsx:254` (angle mode), `ConverterPad.tsx:66` (category), `Logs.tsx:135` (level), `NoteEditor.tsx:671` (mode), `Paint.tsx:636` (tool), `OpenWithDialog.tsx:90` (picked app), `EventDialog.tsx:312, 324` (colour) and `EventDialog.tsx:358`'s native `type="radio"`.
   - **A multi-select** becomes `ToggleGroup multiple`: `RecurrenceFields.tsx:81` (weekdays).
   - **An on/off** becomes Base UI `Toggle`: the other ~20 (`TrayVolume.tsx:63`, `NotificationPanel.tsx:90`, `FindBar.tsx:110, 120`, `TransportBar.tsx:186, 223, 252`, `StickyNotes.tsx:129, 353`, `FileManager.tsx:1102, 1132`, and so on).
   - **Kept as buttons:** `DesktopIcon.tsx:80` (a selected icon, not a toggle) and `WorkspacePips.tsx:40` (the current workspace, a navigation list).

   A picker that saves on each choice uses a guarded `ToggleGroup` instead (Q41); none of the 32 does today, so the guard has no caller in this repo yet.
3. **The Appearance radios.** `apps/core/src/modules/settings/AppearanceSettings.tsx:255-290` and `:311` are a hand-built `role="radiogroup"` with roving focus through `querySelectorAll('[role="radio"]')`. It becomes `RadioGroup` + `Radio`, keeping the preview cards as the radio's content.
4. **Sliders.** `TrayVolume.tsx:76` and `TransportBar.tsx:260` use a native `type="range"`. Q16 does not cover range inputs. Default: Base UI `Slider` in the kit. `Timebar.tsx` (`role="slider"`, hand-built, `apps/add-ons/media-player/src/components/Timebar.tsx:63`) moves onto the same wrapper, if its seek-preview behaviour fits.
5. **Popover.** Core's three popovers become one kit `Popover` wrapper (rule 3).
6. **Native `<select>`: 2** (`ConverterPad.tsx:150`, `TransportBar.tsx:231`). The repo's rule 31 already wants the kit `Select`.
7. **Native checkboxes: 2.** `MarkdownPreview.tsx:198` renders a task-list item from Markdown and stays native. `FilePicker.tsx:329` moves to the kit `Checkbox`.

**Considered and left** (a recorded exception each, in `scripts/conventions.json`, so the checker does not flag them):

- **The toast host**, `apps/core/src/shared/components/notifications/ToastHost.tsx`. It is a view of `notificationStore`, the notification centre: sticky errors, 6 s auto-dismiss, click-to-open, do-not-disturb. Base UI's `Toast` would duplicate the store. Rule 23 keeps `notify()` as the one way in.
- **Start's menu** (`StartMenu.tsx:209`, `role="menu"`): a search field, a pinned grid and an A-Z list ([wiki/decisions-themes.md](../../wiki/decisions-themes.md), 2026-11-06), a launcher, not a Base UI `Menu`.
- **The command palette's list** (`CommandPalette.tsx:177`) and **the Alt+Tab switcher** (`AltTabSwitcher.tsx`): key-driven overlays. The palette keeps its Base UI `Dialog`; moving it onto `Autocomplete` is a later choice.
- **Native text, date and time inputs** (Q16), and the `MarkdownPreview` checkbox.
- **`Timebar.tsx` and the desktop's own marquee**: no Base UI equivalent.

**Not applicable:** Q40 (the phone navigation drawer). The OS has a desktop shell and no phone menu panel (`grep -rniE "mobile|phone" apps/core/src/shared/components/desktop` finds none); the phone is handled by a touch-aware Start (`StartMenu.tsx:27`) and the desktop at its own size. Base UI's `Drawer` has no use here today.

### The theme switch (Q18)

Today the mode is a two-way choice, `Mode = 'light' | 'dark'` (`apps/core/src/shared/store/appearanceStore.ts:8`), set in Settings → Appearance (`AppearanceSettings.tsx:48-56`), persisted in the store, light by default. The owner's call of 2026-11-10 is Light / Dark / System everywhere, light by default on a first visit, kept on the device. So the **System** choice is what is missing. [wiki/decisions-themes.md](../../wiki/decisions-themes.md) (2026-11-02) rejected "following the device's setting" **as the default**; offering it as a third choice does not reopen that, and the default stays light. The decision still gets a revisit note and a `log.md` entry, because the corpus rules ask for one when a locked call moves.

### The 13 px root (Q44)

The size sits on `html, body, #root` (`apps/core/src/index.css:271`), and every spacing utility is rem-based, so `p-2`, `h-5`, `gap-1` and the rest are tuned at 13 px (a `px-2` is 6.5 px). A pixel size on `html` overrides the reader's own font setting. Q44 moves the size onto `body` and the root back to the browser's default. Done alone, that scales every spacing utility by 16/13, which is a visible change. So the step sets `--spacing` in the `@theme` block to `0.203125rem` (0.25rem times 13/16), so each utility keeps its pixel value, and re-expresses the rem-sized utilities that do not read `--spacing`: the 10 named text sizes (`text-sm` ×4, `text-base` ×2, `text-2xl` ×3, `text-3xl` ×1) become named scale entries of the same pixel value (Q62). The 494 `text-[Npx]` lines are unaffected.

## Owner decisions (settled 2026-11-10)

1. **Q15:** Base UI is imported only under `ui/` folders. Core's three direct imports move behind the kit.
2. **Q16:** native text, date and time inputs stay native.
3. **Q18:** a Light / Dark / System choice, light by default, kept on the device. No `@custom-variant dark` here: the repo's rule 7 is stricter (see the table).
4. **Q41, Q57:** a filter that switches what a list shows is a `RadioGroup` (a `Tabs` where it switches panels); a picker that saves on each choice is a guarded `ToggleGroup`.
5. **Q44:** the root font size goes back to the browser's default, the app's 13 px moves onto `body`, and `--spacing` is set so nothing moves.
6. **Q58:** a dialog that holds a form sets `disablePointerDismissal`. It closes with Cancel, the X or Esc. Inline "Delete? Yes / No" stays where it exists; this repo's confirms stay dialogs, built on `AlertDialog` with a pending state.
7. **Q62:** a named type scale in `@theme`; tests select by role, and `data-testid` only where no role fits. No `phone` variant.
8. **Q19:** done when before and after screenshots at 1280 and 390 px show no visible change to layout or colour. A few pixels of spacing needn't be fixed or listed.
9. **Q59:** wrappers live in the kit (`packages/ui/src/components/`), which is the one `ui/` folder add-ons may reach.

## Owner decisions (defaults)

- **Range inputs become Base UI `Slider`** (not covered by Q16). *Question for the owner:* keep the native range where a native slider is the better touch control?
- **The toast host and Start stay as they are**, with `conventions.json` entries and their reasons (above).
- **The kit grows by six components** (`Tabs`, `RadioGroup`, `ToggleGroup`, `Toggle`, `Popover`, `Slider`) plus an `AlertDialog`-based `ConfirmDialog`. The kit's export list in `packages/ui/src/index.ts` only grows, so `SHARED_KIT_VERSION` stays 1 (adding an export is not a bump).

## The wrapper set: `packages/ui/src/components/`

| File | What it is | From |
|---|---|---|
| `Dialog.tsx` | Base UI `Dialog`: Escape guard on the change `details`, `initialFocus` (first `[data-autofocus]`, else first field, else the footer's first button), `disablePointerDismissal` as a prop that forms set, `render` on the trigger, an `aria-label` on the close button | `Dialog.tsx`, changed; props only grow |
| `ConfirmDialog.tsx` | Base UI `AlertDialog` that cannot be dismissed while its action runs, with a pending label; `useConfirm()` keeps its signature | `ConfirmDialog.tsx`, rebuilt |
| `PromptDialog.tsx` | sets `disablePointerDismissal` (a form) | `PromptDialog.tsx:46` |
| `Popover.tsx` | Base UI `Popover`, portalled, z-index from the token scale | `Tray.tsx:86, 169`, `TrayVolume.tsx:39` |
| `Tabs.tsx` | Base UI `Tabs` | `Calculator.tsx:41`, `CodeEditor.tsx:832`, Clock's tabs |
| `RadioGroup.tsx` | `RadioGroup` + `Radio` | the 9 choice sets and `AppearanceSettings.tsx:255-311` |
| `ToggleGroup.tsx`, `Toggle.tsx` | Base UI `ToggleGroup` (`multiple`, guarded form) and `Toggle` | the weekday toggles and the ~20 on/off buttons |
| `Slider.tsx` | Base UI `Slider` | `TrayVolume.tsx:76`, `TransportBar.tsx:260` |

`Button`, `Checkbox`, `ContextMenu`, `Input`, `ScrollArea`, `Select`, `Separator`, `Tooltip` stay as they are, except for the z-index tokens. Core's `apps/core/src/shared/components/ui/` stays a set of re-export shims.

## Files you OWN

- `packages/ui/src/components/**`, `packages/ui/src/index.ts`, `packages/ui/src/theme.css` (the `@theme` z scale, the type scale, `--spacing`).
- `apps/core/src/index.css` (the 13 px move) and `apps/core/src/shared/store/appearanceStore.ts`, `apps/core/src/modules/settings/AppearanceSettings.tsx` (System mode), `apps/core/src/contrast.test.ts`.
- The three core files with direct Base UI imports, `AuthGate.tsx`, `AltTabSwitcher.tsx`, `ToastHost.tsx`, `Taskbar.tsx`, `StartMenu.tsx` (z tokens only).
- The add-on files named in the audit, for the widget swaps.
- `apps/add-ons/notepad/src/lib/highlight.css`, if it moves into `index.css`.
- The tests for all of the above, including every jsdom test that selects by class names.
- `scripts/conventions.json` (new in brief 86) entries.
- Corpus: [wiki/ui-conventions.md](../../wiki/ui-conventions.md) (rules 7, 12, 40, 42, 43 and the pre-flight list), [wiki/decisions-themes.md](../../wiki/decisions-themes.md) (the System choice), [wiki/decisions.md](../../wiki/decisions.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `apps/backend`, `apps/docs`, `apps/wayland-host`, `infrastructure/nix`, `iso/`.
- The theme values (colours, radii, shadows, fonts). Brief 88 owns the look.
- The shell's skeleton: the taskbar, the Start button and menu, the tray and the desktop icons stay where they are ([wiki/decisions-themes.md](../../wiki/decisions-themes.md)).
- The system handle (`packages/ui/src/system.ts`) and `PROTOCOL_VERSION`. `useSystemAppearance` keeps returning the resolved `light` or `dark`.

## What to do

Run `npm run version:bump -- --stage` before every `git commit`. One commit per step, with `npm run check` green after each (`check-base-ui` runs `--warn-only` until step 9).

1. **Before.** Run `check-base-ui` strict and record the counts by rule. Take Playwright or agent-browser screenshots, at 1280 and 390 px, in **Apricot light and Classic dark**, kept out of git, of:
   - the desktop with Start open and a tray popover open;
   - Settings → Appearance and → Marketplace;
   - a kit dialog with a form (Prompt), a confirm and the Open with dialog;
   - the command palette;
   - Calculator, Logs, Notepad and Paint (the choice sets), and Calendar's event dialog;
   - the media player's transport bar.

   Bring-up is in `docs/getting-started.md`. Also count `transition`/`animate-` uses for rule 7, and list the 83 inline `style` sites as geometry or not.
2. **Z-index scale and the dialog wrapper.** Add `--z-*` tokens to `theme.css` and replace the 15 literal `z-[N]` values. Rebuild `Dialog.tsx` per the table, and set `disablePointerDismissal` on `PromptDialog`, the Calendar event dialog and every other form dialog. Replace `bg-black/50` with a token. Check that a Select opened inside a Dialog is in front.
3. **`ConfirmDialog` on `AlertDialog`**, with the pending state. `useConfirm()`, `useUnsavedGuard` and `useFileConflict` keep their signatures and results.
4. **The kit `Popover`**, and the three core popovers on it. Core's three direct Base UI imports reach 0.
5. **The choice sets** on `RadioGroup`, the multi-select on `ToggleGroup`, the on/off buttons on `Toggle`, Appearance's radios on `RadioGroup`. Keep arrow-key behaviour (a `RadioGroup` chooses on arrows; Q41). `Tabs` for the three tab sets, keeping `Calculator`'s per-mode state.
6. **`Slider`** for the volume and the transport's volume; swap the two native selects and `FilePicker.tsx:329`'s checkbox.
7. **The 13 px move and the type scale.** Set `font-size` on `body`, remove it from `html`, set `--spacing: 0.203125rem` in `@theme`, add named type sizes (for example `--text-label` 11 px, `--text-control` 12 px, `--text-body` 13 px) and replace the 494 `text-[Npx]` lines and the 10 named sizes. Add the new sizes to `cn()`'s tailwind-merge config, or the merge drops them. Compare the screenshots: spacing must not move.
8. **The System mode.** `Mode` in the store stays `'light' | 'dark'` for what is painted; add a preference of `'light' | 'dark' | 'system'`, resolved through `matchMedia('(prefers-color-scheme: dark)')` and stamped as `data-theme` (`light` or `dark`, never `system`). A first visit is `light`. A change of the device setting updates the page while System is chosen. Migrate the persisted store so an existing choice stays as it is. Extend `contrast.test.ts` and `appearanceStore.test.ts`.
9. **Conventions and the checker.** Add the `conventions.json` exceptions (toast host, Start's menu, the palette's list, `bg-black`/`bg-white` surfaces). Update [wiki/ui-conventions.md](../../wiki/ui-conventions.md): rule 7 (the System choice), rule 12 (named scale), rule 40 (form dialogs), rule 42 (fixed), and the pre-flight list. Drop `--warn-only` from `check-base-ui`.
10. **After.** Take the screenshots again in the same four combinations and compare. Write the [wiki/decisions-themes.md](../../wiki/decisions-themes.md) revisit note and the [log.md](../../log.md) entry, and run `bash corpus/lint.sh` clean.

## Acceptance

- [ ] `grep -rn "@base-ui/react" apps packages --include=*.ts --include=*.tsx | grep -v "packages/ui/"` prints nothing (core's imports are gone).
- [ ] `check-base-ui` strict reports 0 for rules 1, 2, 3, 6, 8, 9, 10 and 11, and its counts for rules 4, 5 and 7 are in the outcome note.
- [ ] `grep -rnE "z-\[[0-9]+\]" apps packages --include=*.tsx --include=*.ts` prints nothing outside tests.
- [ ] `grep -rnE "text-\[[0-9]+px\]" apps packages --include=*.tsx` prints nothing.
- [ ] A test shows the kit `Dialog`: Esc inside a nested control that already used it does not close the dialog, `initialFocus` lands on `[data-autofocus]`, and `PromptDialog` stays open on an outside click.
- [ ] A test shows `ConfirmDialog` ignoring Esc and the backdrop while its action runs.
- [ ] A test shows each swapped choice set with arrow-key selection, and the weekday group allowing several.
- [ ] A test for the System mode: first visit sets `data-theme="light"`; choosing System with `matchMedia` mocked dark sets `dark`, and a change event flips it; an old persisted `light` or `dark` loads unchanged.
- [ ] `apps/core/src/contrast.test.ts` passes in all four combinations of theme and mode.
- [ ] `getComputedStyle(document.body).fontSize` is `13px` and `getComputedStyle(document.documentElement).fontSize` is `16px` in a browser test (Playwright; jsdom does not compute the default), and a spacing utility keeps its pixel value (`.p-2` is 6.5 px).
- [ ] The before and after screenshots, at 1280 and 390 px, in Apricot light and Classic dark, show no visible change in layout or colour (Q19).
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 86's gate runs everything above. Brief 88 changes the token values on top of this structure, so it must not restyle a widget this brief swapped.
- **imbatranim-apps** vendors the kit through `kit:sync`. New kit exports and a changed `Dialog` and `ConfirmDialog` are additive, so `SHARED_KIT_VERSION` stays 1. After this brief the owner runs `kit:sync` at the last commit here; that repo's own Base UI conventions brief follows.
- The theme switch must survive brief 88 in both themes and both modes.
