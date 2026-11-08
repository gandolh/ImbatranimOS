---
title: An uninstalled URL app's id reads as a built-in's
created: 2026-11-08
status: open
tags: [imbatranim-apps, app-identity]
---

# An uninstalled URL app's id reads as a built-in's

A built-in is told apart from an installed app only by no installed
descriptor holding its id (`installGroupOf`), and a built-in gets the
`system` group. Since 2026-11-08 the token route refuses a catalog app
that isn't installed, and every app while its uninstall runs. A URL app's id
is in no catalog, so once its uninstall has finished, a token registered for
that id would read as a built-in's.

## Context

Found while closing brief 69's review fixes (`ee04778`). Ways out: the
backend learns the built-in app ids (a list shared with core), so `system`
goes only to those and an unknown id gets no identity; or it remembers the
ids of URL apps it removed. The first also stops a made-up id from reading
as a built-in. See [decisions-app-identity-and-trust.md](../wiki/decisions-app-identity-and-trust.md).
