---
title: Code editor — VS-Code-style File menu (open / open-recent)
created: 2026-07-19
status: captured
target: v1.* (post-1.0)
tags: [add-on, code-editor, ux]
---

# Monaco code editor needs a File menu bar

From the first human walkthrough (2026-07-19). The Monaco code-editor add-on
(brief 41) opens files via double-click / openWith from the file manager, but
has no in-app **File** menu the way VS Code does. Wanted:

- A top **File** menu with at least **Open…** (pick a file from the home FS)
  and **Open Recent** (a short MRU list).
- Fits the existing multi-tab + real-FS-save model; no backend change needed
  for Open (reuse the files API + a picker), MRU can persist client-side like
  other add-on stores.

Explicitly scoped to **v1.\*** (post-1.0) by the user — not a 1.0 blocker.
Note: `apps/add-ons/code-editor/src` is currently read-only to the working
user (same perms issue as the clock fix) — unlock before implementing.
