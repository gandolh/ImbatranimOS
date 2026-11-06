# Brief 73 — The Open With chooser links to the Marketplace

## Context

When nothing installed opens a file, the Open With chooser shows a sentence
built from `SUITE_TYPES` in
`apps/add-ons/file-manager/src/lib/marketplaceOpeners.ts`: "No installed app
opens .docx files. Office in Settings → Marketplace does." The owner chose a
link to the Marketplace over an Install button (2026-11-06). Promoted from
the todo `the-chooser-links-to-the-marketplace`.

## Owner decisions (settled 2026-11-06)

1. The sentence gets a link. It opens Settings on Marketplace, scrolled to
   that group's row, with the row briefly highlighted and its Install button
   in reach.

## What to do

1. The link asks the OS to open Settings at Marketplace with the group's
   descriptor id, through an intent Settings reads.
2. Settings' Marketplace pane scrolls to that row and highlights it, and does
   nothing odd if the id isn't in the catalog.
3. Tests for the link's target and the pane's response.
4. A walk: with Office uninstalled, a `.docx` from Files reaches Office's row
   in one click.
5. Corpus: status, log.

## Files you OWN

- `marketplaceOpeners.ts` and the chooser's sentence, the Marketplace
  settings pane's scroll-to, and their tests

## Files you must NOT touch

- The install flow itself.

## Acceptance

- Tests green; the walk holds.

## Outcome (2026-11-06)

Built by a sonnet subagent, commit `2f5a039`. The Open With dialog gets a link
to the Marketplace that opens Settings on the app's row, scrolled into view
and ringed for 2.5 s. `marketplaceOpeners.ts` gains `marketplaceTarget` and
`marketplaceIntent` (office types point at the `imbatranim-office`
descriptor); the open goes through `openApp('settings', {marketplace: id})`.
Tests: `newFileTemplates` and `MarketplaceSettings`. Walk 1 (2026-11-06, 11 of
11) covered the link. The Office-uninstalled `.docx` case is the one the
build named as the walk. Left for the owner: deploy.
