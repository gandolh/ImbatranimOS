---
title: Kit app version refusal reads as a crash; no reinstall at the same ref
created: 2026-10-22
status: open
tags: [marketplace, kit-apps]
---

# Kit app version refusal reads as a crash; no reinstall at the same ref

Two rough edges left by brief 163. A `sharedKit` mismatch refuses the app
through `AppErrorBoundary`, as the protocol refusal does, so the window says
"stopped working", a "crashed" toast appears and a client-error log is sent,
with the useful sentence only under "Show details"; an inline refusal panel in
`KitAppHost` would say it plainly. And the Marketplace pane offers no reinstall
when only `sharedKit` changed at the same ref (the walk used
`POST /api/marketplace/apps/<id>/install`).
