# Brief 97: A vertical scroll area never grows wider than its column

**Depends on:** nothing. **Runs after:** 96.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 by the controller from the todo [the-kits-scroll-area-content-grows-to-its-widest-row](../../todos/the-kits-scroll-area-content-grows-to-its-widest-row.md), found by imbatranim-apps brief 18.

## Context

Base UI's `ScrollArea.Content` carries an inline `min-width: fit-content`. The kit's `ScrollArea` (`packages/ui/src/components/ScrollArea.tsx`) passes it nothing, so in a vertical list the content grows to its widest row: a row's `truncate` never applies, and Tab onto a long row scrolls the viewport sideways. imbatranim-apps fixed its REST sidebar with a `w-0 min-w-full` wrapper; its Todo, Bookmarks, Git GUI and CAD's layer list are the same shape.

## Decisions

- **By orientation, no new prop:** the kit already takes `orientation` (default `vertical`). A vertical-only scroll area gives its content a min-width of 0 (the inline style needs an inline answer or an important utility: a plain class loses to it); `horizontal` and `both` keep Base UI's `fit-content`, so a sideways-scrolling list still scrolls. No public prop changes: `SHARED_KIT_VERSION` stays.
- Check every OS use of the kit `ScrollArea` (core and the add-ons) for one that relies on sideways scroll while leaving `orientation` at its default; give it `orientation="both"` or `"horizontal"` and list it.

## Files you OWN

- `packages/ui/src/components/ScrollArea.tsx` and its test; the OS uses that need an explicit orientation.
- Corpus: `wiki/ui-conventions.md`, `wiki/status.md`, `log.md`; the todo (delete it at closeout).

## What to do

1. The change, with a unit test by attribute or style: a vertical scroll area's content has min-width 0; a `both` one keeps `fit-content`. Show the first fail on today's code.
2. The use check above.
3. One walk in the dev container at 1280 and 390, Apricot light: a list with a long row (the File Manager's tree, a long file name) truncates and Tab onto it keeps the viewport's `scrollLeft` at 0; shots, read.

## Acceptance

- [ ] The tests pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`; the outcome note names the kit commit for imbatranim-apps brief 19 (which then drops brief 18's wrapper and keeps its spec).
