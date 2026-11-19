---
title: The kit's scroll area grows to its widest row
created: 2026-11-19
status: open
tags: [kit, scroll-area]
---

# The kit's scroll area grows to its widest row

Found by imbatranim-apps brief 18 (2026-11-19). Base UI's `ScrollArea.Content` carries an inline `min-width: fit-content` (`@base-ui/react/scroll-area/content/ScrollAreaContent.js`), and the kit's `ScrollArea` (`packages/ui`) passes it no class. So in a vertical list, a row's `truncate` never applies: the content grows to the widest row, and Tab onto a long row scrolls the viewport sideways. The REST client's sidebar lost "Collections" at the left that way; imbatranim-apps fixed its own use with a `w-0 min-w-full` wrapper.

A kit fix: a vertical-only scroll area (most uses) gives its content `min-width: 0`, for example through an `orientation` the kit already knows or a new prop (a public prop: `SHARED_KIT_VERSION`). Then imbatranim-apps drops the REST sidebar's wrapper and its structural test; Todo, Bookmarks and Git GUI's truncating lists are the other uses to check.
