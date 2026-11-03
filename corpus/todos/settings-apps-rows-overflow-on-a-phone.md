---
title: Settings' Apps rows overflow sideways on a phone
created: 2026-11-03
status: open
tags: [settings, responsive]
---

# Settings' Apps rows overflow sideways on a phone

Found in brief 14's check on 2026-11-03. At 390×844, the Settings window is
390 px wide. The rows of its Apps section (each app's icon, name,
description and on/off Checkbox) reach 569 px, so the whole Settings page
scrolls sideways. The Appearance section above them fits (366 px).

The rows sit in a `grid gap-2` in `apps/core/src/modules/settings/Settings.tsx`.
A grid item's minimum width is its content's by default, so the `truncate`
on the name and description never takes effect. Either `min-w-0` on each row
or `grid-cols-[minmax(0,1fr)]` on the grid should let the text truncate. The
markup predates the theme briefs. Check the other Settings sections at the
same width when fixing it.
