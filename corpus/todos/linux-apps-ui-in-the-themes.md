---
title: The Linux apps UI in the themes
created: 2026-11-03
status: open
tags: [themes, linux-apps, settings]
---

# The Linux apps UI in the themes

Found when the Linux apps layer (briefs 01-06) merged with the theme briefs
(08-22) on 2026-11-03. The layer's UI was written before the themes. Scanned
with the same checks as briefs 10, 19 and 20, it has no strong selection
fills, but six bordered boxes in `apps/core/src/modules/settings/LinuxAppsSettings.tsx`
have no radius, so they stay square in Apricot:
- the two error notices (lines 175, 181);
- the search results list (204);
- the small kind badge (223, `rounded-small`);
- the log box (265);
- the installed list (278).

Give them `rounded-control` (`rounded-small` for the badge). Rounding the rows
inside the two lists is brief 17's pattern. Also decide whether the Linux
window's focusable surface (`LinuxWindowBody.tsx`, the `tabIndex={0}`
holder) should show the accent ring. It is the app's own surface, so
probably not. Then walk Settings → Linux apps and a Linux window's title bar
in Apricot light and Classic dark.
