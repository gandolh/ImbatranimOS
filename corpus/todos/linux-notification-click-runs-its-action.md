---
title: A click on a Linux app's notification runs its action
created: 2026-11-05
status: open
tags: [linux-apps, notifications]
---

# A click on a Linux app's notification runs its action

Found building brief 42 (2026-11-05). The session bus's notification server
advertises `actions`, because Firefox sends web notifications to a server
only when it has them (it falls back to its own popup otherwise). But it
invokes none: clicking a Linux app's notification in the OS does nothing,
where on a desktop it would run the `default` action (Firefox: focus the tab
that raised it) and send `ActionInvoked`.

The OS's toasts open an app by `appId` on click and their buttons carry an
`openApp` payload, so a Linux notification needs a click path of its own:
the tab tells the backend which notification and which action, the backend
signals `ActionInvoked(id, key)` and then `NotificationClosed(id, 2)`.
Buttons for other actions (`Reply`, `Snooze`) are a further step; worth a
short grill on whether they show at all.
