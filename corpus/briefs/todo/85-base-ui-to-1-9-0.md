# Task 85: Base UI to 1.9.0, pinned exactly

**Depends on:** nothing. This brief runs first.

**Runs before:** 86, 87 and 88. Brief 87 audits the code against the base-ui skill's rules, and it should audit the version the estate runs, not 1.6.0.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

On 2026-11-09 the owner made one call for every web app they own: Base UI at the latest stable release, 1.9.0 (published 2026-10-09), pinned exactly with no `^`. The skills library's brief 04 covers the bump estate-wide and its brief 02 makes the exact pin rule 1 of the base-ui skill. This brief is the ImbatranimOS part.

### What the repo has today (read 2026-11-10)

- **The pins.** Two `package.json` files name Base UI, both as `"^1.4.1"`:
  - `packages/ui/package.json:20`, the kit;
  - `apps/core/package.json:19`, the desktop.

  No add-on, no marketplace kit app in this repo and no other workspace lists it. Command: `grep -rn "base-ui" --include=package.json apps packages` (without `node_modules`).
- **What the lockfile resolves.** One root `package-lock.json`. `node_modules/@base-ui/react` is **1.6.0**, with `@base-ui/utils` 0.3.1. So the repo runs 1.6.0 today, not the 1.4.1 that the range suggests. Command: read `packages["node_modules/@base-ui/react"].version` from `package-lock.json`.
- **Who imports it.** 12 files, all from subpaths (the base-ui skill's rule 2 is already met):
  - the kit, 9 files in `packages/ui/src/components/`: `Button.tsx:1`, `Checkbox.tsx:1`, `ScrollArea.tsx:1`, `Dialog.tsx:1`, `Tooltip.tsx:1`, `ContextMenu.tsx:2` (`/menu`), `Select.tsx:1`, `Input.tsx:1`, `Separator.tsx:1`;
  - the desktop, 3 files: `apps/core/src/shared/components/CommandPalette.tsx:2` (`/dialog`), `apps/core/src/shared/components/taskbar/Tray.tsx:3` and `TrayVolume.tsx:2` (`/popover`).

  Command: `grep -rn "@base-ui/react" apps packages --include=*.ts --include=*.tsx` without `node_modules` and `dist`.
- **The two names 1.9.0 renamed** (`OTPFieldPreview` to `OTPField`, `sanitizeValue()` to `normalizeValue()`): 0 hits in `apps` and `packages`. Command: `grep -rn "OTPFieldPreview\|sanitizeValue" apps packages --include=*.ts --include=*.tsx`.
- **No test mocks Base UI.** `grep -rln "base-ui" apps packages --include=*.test.ts --include=*.test.tsx` finds nothing, so the jsdom tests run the real components.
- **How the image builds.** `infrastructure/Dockerfile` runs `npm ci` from the root lockfile (line 27 copies it) and then `npx turbo build` (line 75), which runs core's `tsc -b && vite build`. So the lockfile is what ships, and it must be committed with the pin.
- **`.npmrc`:** none. A plain `npm install` writes `^`, so the bump uses `--save-exact`.

### Who else is affected

`packages/ui` is the kit that the repo imbatranim-apps vendors (its `vendor/` folder, refreshed by `kit:sync` at a pinned commit). That repo's own Base UI pin and lockfile follow this brief through `kit:sync`; its brief is its own. A marketplace kit app links against the desktop's instance of `@imbatranim/ui` at runtime (`packages/ui/src/sharedKit.ts`), so a kit app never loads a second Base UI.

## Owner decisions (settled 2026-11-09, 2026-11-10)

1. **1.9.0, exact** (the owner, 2026-11-09). The pin is `"1.9.0"` in both manifests.
2. **A bump is its own commit and its own version** (the repo's rule, 2026-10-07): run `npm run version:bump -- --stage` before `git commit`.

## Files you OWN

- `packages/ui/package.json` and `apps/core/package.json`: the one dependency line each.
- `package-lock.json`.
- Code only where the 1.9.0 types force a change in the 12 files above. Expect none: the audit found no renamed API in use. List any change in the outcome note.
- Corpus: [wiki/status.md](../../wiki/status.md) (one dated line) and [log.md](../../log.md).

## Files you must NOT touch

- `apps/backend`, `apps/docs`, the add-ons, `apps/wayland-host`, `infrastructure/nix` and the Rust and Nix parts of the repo. This brief changes no behaviour and no look.
- Any wrapper's props or markup. That is brief 87.
- `SHARED_KIT_VERSION` (`packages/ui/src/sharedKit.ts`). No kit export or prop changes here, so it stays at 1.

## What to do

One commit for the whole brief, with `npm run version:bump -- --stage` run before it.

1. **Before.** Record in the outcome note: the resolved version (1.6.0), and the screens below as screenshots at 1280 px, kept out of git, so the bump has a baseline. Bring-up is in `docs/getting-started.md`.
   - a dialog (the Open with dialog in File Manager, or the sign-in notice);
   - the command palette (`Ctrl+K`);
   - the tray's three popovers (volume, notifications, and the stats one);
   - a context menu (right-click a desktop icon);
   - a Select (Settings, where one exists);
   - a tooltip;
   - a scroll area with a long list (File Manager).
2. **Bump.** From the repo root:
   `npm install --save-exact @base-ui/react@1.9.0 -w @imbatranim/ui -w @imbatranim/core`.
   Check both manifests read `"@base-ui/react": "1.9.0"` and the lockfile resolves 1.9.0 once, with no second copy under a workspace's `node_modules`. If npm leaves a nested copy, fix the range that asks for it, never an `overrides` entry.
3. **Compile and test.** `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` (turbo runs the workspaces). Fix only what 1.9.0's types or behaviour break, and keep each fix to the 12 importing files.
4. **After.** Take the same screenshots. Walk the seven screens by hand once for behaviour 1.6.0 to 1.9.0 may have moved: focus returns to the trigger after a dialog closes, Esc closes the popover and the menu, a Select's popup opens at the trigger, the tooltip waits 400 ms (`Tooltip.tsx:17`), and a virtualised list still scrolls inside `ScrollArea` through its `viewportRef`. Record every difference.
5. **Corpus.** One line in [wiki/status.md](../../wiki/status.md), a [log.md](../../log.md) entry, and `bash corpus/lint.sh` clean.

## Acceptance

- [ ] `grep -rn '"@base-ui/react"' --include=package.json apps packages` prints exactly two lines, both `"1.9.0"` with no `^` or `~`.
- [ ] `node -e "const l=require('./package-lock.json').packages;console.log(Object.entries(l).filter(([k])=>k.endsWith('node_modules/@base-ui/react')).map(([k,v])=>k+' '+v.version).join('\n'))"` prints one line, `node_modules/@base-ui/react 1.9.0`.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] `docker build` of `infrastructure/Dockerfile` reaches the end of its `turbo build` layer (the owner runs the full image; the build layer is enough here).
- [ ] The before and after screenshots show no visible change at 1280 px, and any difference is listed in the outcome note. A few pixels of spacing needn't be listed (the owner, 2026-11-10, Q19).
- [ ] `git diff HEAD~1 --stat` shows only the two manifests, the lockfile, the version-bump files, the corpus lines and at most a handful of lines in the 12 importing files.
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 86's `check-base-ui` reads this pin (rule 1) and starts green.
- Brief 87 audits against 1.9.0's types and components (`Tabs`, `Toast`, `Slider`, `RadioGroup`, `ToggleGroup`, `AlertDialog`, `Popover`).
- imbatranim-apps' own bump follows this one through `kit:sync`, at the commit this brief produces. The owner runs it; it is not in this brief.
