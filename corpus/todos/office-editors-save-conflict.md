---
title: The office editors should ask before overwriting a file changed on disk
created: 2026-10-04
status: captured
tags: [files, editors, office]
---

# Office editors: the save-conflict check

Brief 155 gave Notepad, Code Editor and Markdown Editor a save precondition:
each sends the version it read, and a 409 opens `FileConflictDialog`
(Overwrite / Reload from disk / Cancel). The owner confirmed on 2026-10-04 that
the office editors (documents, spreadsheets, slides) get the same check
later, not in the first cut ([decisions-estate-era.md](../wiki/decisions-estate-era.md)).

The pieces exist: `system.fs.readWithVersion`, `upload(..., { expected })`,
`FileConflictError`, and the kit's `useFileConflict()`. What each office editor
needs is to keep the version of its saved baseline, send it on save, and wire
the three answers to its own document model. Reload in a rich editor should
stay undoable where the editor allows it, as Code Editor's does.
