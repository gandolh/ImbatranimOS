# Brief 95: The Image Viewer says when a folder can't be read

**Depends on:** brief 90 (the By date grid). **Runs after:** the house-style 1.3.0 sync (no container needed).

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 by the controller (a bug with one obvious shape), from the todo [image-viewer-grid-says-no-images-when-the-folder-cannot-be-read](../../todos/image-viewer-grid-says-no-images-when-the-folder-cannot-be-read.md), found by the brief-auditor's check of brief 90.

## Context

When listing the folder fails, the viewer sets its siblings to an empty list (`apps/add-ons/image-viewer/src/ImageViewer.tsx`, the sibling effect), the same as when the opened file is no longer among the images. The single view then shows the opened file alone, which is right; the By date grid says "No images in this folder" (`DateGrid.tsx`), which is wrong when the listing failed.

## Decisions

- Tell the two apart in state: a failed listing is its own state, not an empty list.
- **A failed listing:** the grid shows "Couldn't read this folder" with a Retry button (the kit's `Button`), which lists the folder again. The single view is unchanged.
- **A missing file** (listed, but the opened file isn't among the images): unchanged.

## Files you OWN

- `apps/add-ons/image-viewer/src/` and its tests. Corpus: `wiki/status.md`, `log.md`. The todo is already marked promoted; delete it at closeout.

## What to do

1. The state and the grid's message; tests: a rejected `/files` call shows the message and Retry, Retry lists again and shows the grid; an empty folder still says "No images in this folder"; each new test fails on today's code.
2. No container walk: the tests carry it.

## Acceptance

- [ ] The tests pass; `npm run check` exit 0; `bash corpus/lint.sh` OK.
- [ ] End move `ready_for_deploy`, owner step `node cli.ts imbatranim-os server`.

## Outcome (2026-11-19)

`18c3168` (1.363.0, ready for deploy): the viewer keeps a failed listing as its own state (`listFailed`, set in the sibling effect's catch) apart from an empty folder. The By date grid shows "Couldn't read this folder" with a kit `Button` Retry, which clears the failure, resets the siblings to loading and lists again. An empty or missing-file folder is unchanged, and so is the single view. The new test (a `/files` call that rejects once, then Retry) fails on the old code ("No images in this folder" shown). No container walk; the tests carry it.

**Owner step.** `node cli.ts imbatranim-os server` from vps-deploy.
