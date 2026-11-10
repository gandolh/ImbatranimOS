# Task 88: A redesign with Hallmark, on the estate board

**Depends on:**

- In this repo: brief 87 (Base UI by the conventions, the theme switch, the type scale and the z-index scale) and brief 86 (the gate). The look changes on top of that structure.
- In the owner's skills library:
  - brief 24, now "vendor Hallmark as the design skill, and adopt taste-skill 2.5's ideas" (palettes and type dealt by trade, and its copy layer);
  - the estate redesign board: one artifact with a page per app, owned by the skills library.
- The owner's call of 2026-11-10 (Q39): no bake-off; Hallmark redesigns every web UI, and the owner approves each app on the board before any code changes.

**Runs before:** nothing.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

ImbatranimOS is a web desktop: a Windows-style shell (taskbar, Start, tray, desktop icons, windows) running real apps, a real terminal and real files, from one self-hosted container. Its UI is in `apps/core/src` (the shell), `packages/ui/src` (the kit every app shares) and 15 built-in apps under `apps/add-ons/`.

### What its design docs fix today

- **The skeleton is locked.** The taskbar, the Start button and menu, the tray and the desktop icons stay where they are ([wiki/decisions-themes.md](../../wiki/decisions-themes.md), 2026-11-02), and there is **no glass** (flat surfaces, no `backdrop-filter`).
- **Best UX, not Windows 7** (owner, 2026-11-06): "Pick best ui/ux, we are not stuck with win7 style" ([wiki/decisions-themes.md](../../wiki/decisions-themes.md), "Start's contents follow current desktops, not Windows 7", and the done brief [72](../done/72-start-gets-search-pins-and-an-a-to-z-list.md)). Recommend the better current pattern and say so; don't present Win7 faithfulness as a reason. The taskbar skeleton itself still needs a corpus revisit to move.
- **Two themes, each in a light and a dark mode, light by default:** Apricot (cream and peach, five pastel accents, soft corners, Figtree) and Classic (black and white with crimson, square corners, Space Grotesk). Colours, corners and the UI font come from the themes, through token names that never change ([wiki/ui-conventions.md](../../wiki/ui-conventions.md) rules 5-11), so every app works in all four combinations and in every accent.
- **Selected is soft, an action is strong** (rule 6); a selected chip keeps a deep border (decisions-themes, 2026-11-03).
- **Compact density** at a 13 px body (rules 12 and 15), the six token radii and the shadow variables.
- **Familiar navigation** (owner): no new metaphors.

### The screens (read 2026-11-10)

| Screen | Rendered by |
|---|---|
| Sign-in, unlock and first-run | `apps/core/src/modules/auth/AuthGate.tsx`, `AuthShell.tsx`, `LocalScreens.tsx`, `SessionScreens.tsx` |
| Desktop: wallpaper, icons, widgets, marquee, context menu | `apps/core/src/shared/components/desktop/Desktop.tsx`, `DesktopIcon.tsx`, `WidgetLayer.tsx`, `DesktopContextMenu.tsx`, `SunsetHills.tsx` |
| Taskbar, Start, tray, workspace pips | `apps/core/src/shared/components/taskbar/Taskbar.tsx`, `StartMenu.tsx`, `Tray.tsx`, `TrayVolume.tsx`, `WorkspacePips.tsx`, `TaskbarContextMenu.tsx` |
| Window frame and snap overlay | `apps/core/src/shared/components/window/Window.tsx`, `SnapOverlay.tsx`, `AppErrorFallback.tsx` |
| Notifications: toasts and the panel | `apps/core/src/shared/components/notifications/ToastHost.tsx`, `NotificationPanel.tsx` |
| Command palette, Alt+Tab, shortcuts overlay, file picker, old-data notice | `CommandPalette.tsx`, `switcher/AltTabSwitcher.tsx`, `shortcuts/ShortcutsOverlay.tsx`, `files/FilePicker.tsx`, `OldDataNotice.tsx` |
| Settings (Appearance, Marketplace, Storage, Updates, Startup, Default apps, Linux apps, Backup, Old data, About) | `apps/core/src/modules/settings/Settings.tsx` and its panels |
| Marketplace host and refusals, Linux windows | `apps/core/src/modules/marketplace/RefusalPanel.tsx`, `modules/linux-windows/LinuxWindowBody.tsx` |
| The kit's dialogs and controls | `packages/ui/src/components/*.tsx` |
| The 15 built-in apps | `apps/add-ons/*/src` (Browser, Calculator, Calendar, Clock, Code Editor, File Manager, Image Viewer, Logs, Media Player, Notepad, Paint, Terminal, Snipping Tool, Sticky Notes, System Monitor) |

The add-ons follow the tokens by rule 7, so they change with the token set. Only their own layouts need a screen of their own.

Out of scope: `apps/docs` (a Docusaurus site, governed by the estate's docs-site recipe; *question for the owner: does the board take a page for it?*), the Rust host, `infrastructure/nix` and `iso/`.

## Owner decisions (settled)

- **Q39 (2026-11-10):** no bake-off; Hallmark designs the proposal; the owner approves on the board before code changes.
- **2026-11-06:** best UX, not Win7; keep the taskbar skeleton.
- **2026-11-02:** two themes, light by default; no glass.
- **Q18 (2026-11-10):** the Light / Dark / System switch survives the redesign (brief 87).

## Files you OWN

- `packages/ui/src/theme.css` and the token blocks in `apps/core/src/index.css` (values, not names).
- The screen files listed above, one screen per commit.
- `apps/core/src/contrast.test.ts` and the floor tests below.
- Corpus: [wiki/decisions-themes.md](../../wiki/decisions-themes.md) (a revisit note for any locked call the owner reopens on the board), [wiki/ui-conventions.md](../../wiki/ui-conventions.md), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- Token **names** (they are the contract with every add-on and kit app), the system handle and `PROTOCOL_VERSION`.
- The skeleton (taskbar, Start button and menu, tray, desktop icons) and the "no glass" rule, unless the owner reopens one on the board.
- `apps/backend`, the Rust host, `infrastructure/nix`, `iso/`.

## What to do

Run `npm run version:bump -- --stage` before every `git commit`.

1. **Screenshots of today**, every screen above, at 1280 and 390 px, in Apricot light, Apricot dark, Classic light and Classic dark, kept out of git. Bring-up is in `docs/getting-started.md`.
2. **A proposal per screen** with Hallmark (taste-skill 2.5's trade palettes and copy layer where they help), inside the decisions above. The proposal is mostly a new token set (palette, type, radii, shadow, density) and the shell, Settings and kit-dialog layouts; the add-ons follow. Mind the pastel accents: Apricot's soft accent fails as text on cream (rule 6), so a new palette keeps the strong and soft pairs.
3. **Put it on this app's page of the estate board**, beside today's screenshots, at 1280 and 390 px.
4. **Wait for the owner's approval on the board.** Nothing below starts before that. Record the approval in [log.md](../../log.md) with its date.
5. **Build it as a token change first**, one commit that changes only `theme.css` and `index.css` values and the `contrast.test.ts` expectations. Then **one screen per commit**, in the order of the table. Each commit also updates the affected wiki line.

## Acceptance

- [ ] The owner's approval on the board is recorded in [log.md](../../log.md) with the date.
- [ ] Hallmark's Floor checks, as commands or tests:
  - contrast: `npx vitest run apps/core/src/contrast.test.ts` passes in all four theme and mode combinations and for every accent preset (text 4.5:1, large text and borders 3:1);
  - a visible focus ring: a test or Playwright check that `:focus-visible` has a ring of at least 2 px and 3:1 against its surface on the Start menu, a dialog button and a taskbar button;
  - a `prefers-reduced-motion` path: a Playwright run with `reducedMotion: 'reduce'` shows no running transition on the window frame, Start or the toast (`getAnimations()` is empty);
  - no invented facts or numbers: `grep` of the new copy against the product's real strings finds none that Hallmark's copy layer made up, checked in review and listed in the outcome note;
  - no horizontal scroll at 390 px: Playwright asserts `document.documentElement.scrollWidth <= 390` on the sign-in screen, the desktop and Settings.
- [ ] `getComputedStyle` shows the 13 px body and a 16 px root unchanged (brief 87's test still passes), and the Light / Dark / System switch works in both themes (its tests still pass).
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 87 owns structure and the theme switch; this brief changes values on top. It must not restyle a widget in a way that breaks the kit's props.
- The kit's `Dialog`, `ConfirmDialog` and the rest change look only, so `SHARED_KIT_VERSION` stays 1. imbatranim-apps picks the new look up through `kit:sync`.
- The redesign must hold in both themes and both modes plus every accent preset; the existing `contrast.test.ts` is already a Floor check to extend.
