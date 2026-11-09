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

## Outcome (2026-11-09)

Built in `73fc08d` (1.267.0). `lib/clipboard.ts` holds `copyPng`, which never
throws and returns the reason in plain words when the write is refused. The
capture function starts the clipboard write at once with the PNG still a
promise (the raster resolves behind it), which can keep a region snip's click
alive; the editor opens either way and a toast follows: "Copied to clipboard"
or "Couldn't copy to clipboard" with the reason. The Copy button uses the same
helper, so it copies the edited image. Save is untouched.

- Delayed and full-screen captures finish with no user action. Firefox and
  Safari (the owner's phone too) refuse the write there, so the "couldn't
  copy" toast is expected, not a bug; Copy in the editor works.
- The toast is `system.notify`, which always also records an entry in the
  notification centre; the kit has no transient toast, so that is what was
  chosen.
- Tests cover the helper in node (a stubbed `ClipboardItem`, as jsdom has
  none): one `image/png` item, the promise passed through, the refusal
  reasons. The component flow (editor stays, toast shown) is not unit-tested;
  the tests run in node with no DOM. Needs the owner's walk on HTTPS: snip an
  area, paste into Paint or a chat; annotate, Copy, paste again.
