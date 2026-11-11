---
paths:
  - "apps/core/src/**"
  - "packages/ui/src/**"
  - "apps/add-ons/*/src/**"
---

# The web workspaces (core, the kit, the add-ons)

- Read [corpus/wiki/ui-conventions.md](../../corpus/wiki/ui-conventions.md) before you build or change a screen.
- **Semantic tokens only**: `bg-surface-container-low`, `text-on-surface-variant`, `bg-primary`. No hex, no `rgb()` in a
  class, no `dark:` variants: the token blocks carry the modes.
- **An add-on imports only** `@imbatranim/ui`, the injected `system` handle (`useSystem()`) and its own dependencies.
  From `@imbatranim/core` it imports types only. No other add-on, no `../../core/*`. Core imports an add-on only in
  `src/manifest.ts`, and the kit imports nothing above itself. ESLint enforces this (`eslint.config.mjs`).
- **Base UI goes through the kit.** An app uses `Button`, `Dialog`, `Select`, `ConfirmDialog` and the rest from
  `@imbatranim/ui`; it does not import `@base-ui/react` itself. Base UI is pinned at 1.9.0.
- No native dialogs: `useConfirm()` and `usePrompt()` from the kit.
- Check a change in two combinations: Apricot light and Classic dark.
- The root font size is 13 px, so `rem` is not 16 px here.
- The kit's public props are a contract with imbatranim-apps, which vendors `packages/ui`. A change to them bumps
  `SHARED_KIT_VERSION`.
- No `!` in source: narrow with a guard, or take the value through `required()` (a small helper in the workspace's
  `lib/`) where a missing value is a bug. Tests may use `!`.
- No `console` in source. The desktop has no client logger yet, so a diagnostic carries a dated
  `eslint-disable-next-line no-console` with that reason.
- Every promise is awaited, returned or marked `void`. A handler that calls an async function writes
  `() => void handle()`.
- Prettier sorts Tailwind class names; run `npm run format`.
