# Task 92: The shell's apricot styles win over a kit app's stylesheet

**Depends on:** nothing.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of 2026-11-13
([todos/a-kit-apps-stylesheet-can-undo-the-shells-apricot-styles.md](../../todos/a-kit-apps-stylesheet-can-undo-the-shells-apricot-styles.md))
in the owner's backlog grill. The fix is the controller's technical call,
the one the todo names.

## Context

A kit app's stylesheet stays in the page once its window has opened, and
it loads after the desktop's own. Tailwind's `apricot:` variant
(`apps/core/src/index.css`) wraps its selector in `:where()`, so it adds no
specificity, and a kit utility for the same property, coming later in the
page, wins. Brief 88 fixed the two places its shots showed: the `phone:`
variant, which `:root` raises a step (`41462bc`), and the desktop tiles
(`d0a445b`). About 38 other `apricot:` styles in `apps/core/src` (the
taskbar buttons and Start's position among them) still have the weakness.

## Decision

Raise `apricot:` the way `phone:` is raised, so the shell's apricot styles
always beat a kit utility; then check that no kit app relied on beating
one. If raising it breaks a shell style that a later shell utility was
meant to override, say which and fix that place, not the variant.

## Files you OWN

- `apps/core/src/index.css` (the variant), the shell files a regression
  shows, and a test
- Corpus: `wiki/ui-conventions.md` (the variant's rule, beside `phone:`'s),
  `wiki/status.md`, `log.md`, the todo (delete it at closeout)

## What to do

1. Raise the variant; a test (or a build-output check) shows an `apricot:`
   rule outranking a same-property kit utility loaded later.
2. Walk in the dev container: open Docs (or another kit app), then compare
   the taskbar, Start, the desktop tiles and a window frame in Apricot light
   and dark at 1280 and 390 before and after the app opened. Shots of each
   pair.
3. Look at imbatranim-apps brief 11's screenshots for any shell part that
   changed look once an app was open; each must now hold.

## Acceptance

- [ ] The shell parts look the same before and after a kit app opens, in
      the walk's four shots per look.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.
