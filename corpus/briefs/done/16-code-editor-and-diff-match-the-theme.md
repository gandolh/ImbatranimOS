# Brief 16 — The Code Editor and Diff match the theme

## Context

Settled with the owner on 2026-11-03, after the theme briefs 08-15. The Code
Editor and Diff draw Monaco with its built-in `vs` / `vs-dark` themes: a white
or `#1e1e1e` editor in every theme. In Apricot that is a white box in a cream
window. Separately, `DiffTool.tsx` picks its theme from the device's
`prefers-color-scheme` once at mount, not from the OS mode. That's a bug: on a
dark device the diff is dark in Apricot light.

## Spec

1. A Monaco theme built from the OS colours: `defineTheme` with `base`
   `vs`/`vs-dark` by mode and `inherit: true`, so Monaco's syntax colours
   stay. Colours from the tokens:
   - editor background and foreground;
   - line numbers, current line and selection;
   - the cursor in the strong accent;
   - widget and suggest backgrounds and borders.
2. It is redefined and reapplied when the appearance changes (theme, mode or
   accent). The add-on reads the CSS variables from `<html>` after
   `applyAppearance` has run, the way the Terminal does.
3. Both the Code Editor and Diff use it, and Diff follows the OS mode, not
   `prefers-color-scheme`.

## Must preserve

Syntax highlighting, the editor's options and fonts, and the add-on contract.
The add-on imports nothing from core.

## Acceptance

- In all four combinations the editor's background and text are the window's
  surface and text.
- Switching theme or mode in Settings restyles an open editor and diff with no
  reopen.
- Typecheck, lint and code-editor's tests pass.

## Files you OWN

`apps/add-ons/code-editor/src/**`, `corpus/wiki/status.md`, `corpus/log.md`.

## Outcome (2026-11-03)

**Built in the code-editor commit after `c6e7bfd`.**
- `lib/osMonacoTheme.ts` builds the theme data from a resolver (base
  `vs`/`vs-dark` by mode, `inherit: true`, no rules).
- `lib/useOsMonacoTheme.ts` defines it as `imbatranim-os` before the first
  render. It redefines it and calls `setTheme` one animation frame after the
  mode or accent changes.
- Both `CodeEditor.tsx` and `DiffTool.tsx` use it. Diff no longer reads
  `prefers-color-scheme`.

**Checked:**
- Typecheck; lint (one old warning in `DiffTool.tsx`, an unused
  eslint-disable).
- code-editor's tests (26, four new for the mapping). The editor test mocks
  the hook, since Monaco can't load in jsdom.
- In the browser, with a file open, the editor background was `#fffdf9` in
  Apricot light. Switching to dark in Settings with the editor open turned it
  `#231d1a`, Classic dark `#141416`, and back again, all without reopening.
- Not checked live: typed syntax colours (the headless keyboard didn't reach
  Monaco) and the Diff window (it needs two files).
