# Brief 78 — A snip goes to the clipboard

## Context

The Snipping Tool (`apps/add-ons/snipping-tool/`) opens its editor after a
capture. Copying is a button in the editor
(`components/AnnotationStage.tsx`, "Copy to clipboard"), and since brief 70
Save always opens the Save dialog, in `~/Pictures/Screenshots` with a name
filled in. The owner wants it to work like the Windows 10 Snipping Tool: the
capture is on the clipboard at once, and saving is a separate step where
the owner picks the place.

## Depends on

- brief 70 (Save through the dialog; the dialog above the capture stage).

## Owner decisions (settled 2026-11-09)

1. A finished capture is copied to the desktop's clipboard straight away,
   with a toast "Copied to clipboard". The editor still opens.
2. Save stays a button that opens the Save dialog, where the owner chooses
   the place. No silent save to a fixed folder.

## What to do

1. When a capture finishes, write it to the clipboard as `image/png`, then
   show the toast. Copy (the existing button) copies the edited image, so
   the clipboard can be updated after annotating.
2. The clipboard needs a secure context (HTTPS or localhost), and browsers
   may also need a recent user action. If the write is refused, show a
   toast saying it couldn't copy, with the reason in plain words, and keep
   the editor open. Nothing else changes.
3. Keep Save as it is (brief 70's dialog).

## Files you OWN

- `apps/add-ons/snipping-tool/` and its tests
- `corpus/`

## Files you must NOT touch

- The clipboard bridge to Linux apps.

## Acceptance

- Tests: a finished capture writes one PNG to the clipboard and shows the
  toast; a refused write shows the "couldn't copy" toast and the editor
  stays; Copy after an edit writes the edited image; Save still opens the
  dialog.
- The Snipping Tool's typecheck and tests pass.
- Walk step for the owner, on the VPS (HTTPS): snip an area, paste into
  Paint or a chat, the snip is there; annotate, Copy, paste again, the
  annotation is there.
