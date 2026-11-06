---
title: The Open With chooser links to the Marketplace
created: 2026-11-06
status: promoted
tags: [imbatranim-apps]
---

# The Open With chooser links to the Marketplace

When nothing installed opens a file, the chooser's sentence ("No installed app opens .docx files. Office in Settings → Marketplace does.") gains a link that opens Settings → Marketplace on that group's row. Small, this repo only.

Decided in the imbatranim-apps grill on 2026-11-06: a link, not an Install
button. Grill the open question below when the work starts, then promote
this to a numbered brief.


> PROMOTED 2026-11-06 to [brief 73](../briefs/todo/73-the-chooser-links-to-the-marketplace.md), after the grill. The brief is the spec; this todo keeps the questions as asked.
## Open questions (grill before starting)

1. **Where does the link land?** Answered 2026-11-06: yes.

## Draft brief

### What to do

1. The sentence built from `SUITE_TYPES` in
   `apps/add-ons/file-manager/src/lib/marketplaceOpeners.ts` gets a link
   that asks the OS to open Settings at Marketplace with the group's
   descriptor id (an intent Settings can read).
2. Settings' Marketplace pane scrolls to and highlights that row.
3. Tests for the link's target and the pane's response; a walk opening a
   `.docx` with Office not installed.
4. Corpus: status, log.

### Acceptance

- Tests green; from a `.docx` with Office uninstalled, one click lands on
  Office's row.
