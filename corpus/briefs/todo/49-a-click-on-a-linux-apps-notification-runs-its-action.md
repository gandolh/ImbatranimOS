# Brief 49 — A click on a Linux app's notification runs its action

## Context

Promoted on 2026-11-06 from the todo `linux-notification-click-runs-its-action`
(found building brief 42). The session bus's notification server
(`apps/backend/src/modules/linux-apps/dbus/notifications.ts`) advertises
`actions`, because Firefox sends web notifications to a server only when it
has them, but invokes none: clicking a Linux app's notification in the OS
does nothing. On a Linux desktop a click runs the `default` action (Firefox:
focus the tab that raised it) and the server sends `ActionInvoked`.

Today a notification reaches the tab as `{ type: 'notification', id, app,
summary, body }` (`apps/core/src/modules/linux-windows/connection.ts`) and
`LinuxNotifications` (`linuxNotifications.ts`) turns it into an OS
notification through the notification store; closing it there sends
`notification_close`, and the backend signals `NotificationClosed`. The
OS's own toasts open an app by `appId` on click; a Linux notification needs
a click path of its own.

## Owner decisions

Settled on 2026-11-06: **a click runs the default action; no extra action
buttons** ("Reply", "Snooze" stay off), so the toasts look like the
desktop's own. The smaller calls, with the default this brief builds:

1. **A notification without a `default` action.** Default: a click only
   closes it (reason 2, dismissed by the user), as now.
2. **Focus.** Default: after `ActionInvoked`, the tab raises the app's
   Linux window when the app has exactly one; with several, it leaves focus
   where it is (the app decides, as Firefox does by raising its own window).

## What to do

1. The backend keeps each notification's action keys from `Notify`, and
   tells the tab whether it has a `default` action (one more field on the
   `notification` message).
2. The tab: a click on such a notification sends `notification_action`
   (`id`, `key: 'default'`) and closes the toast; the backend checks the id
   belongs to that session, emits `ActionInvoked(id, 'default')`, then
   `NotificationClosed(id, 2)`, and forgets it.
3. The comment in `notifications.ts` that says a click does nothing is
   rewritten to say what happens now.
4. Tests: the wire format of `ActionInvoked`, the backend's session check
   (an id from another session is ignored), a notification with and
   without `default`, and the tab's click handler.
5. A walk in the dev container: a web notification from a page in Firefox
   (`new Notification(...)` after a permission grant); clicking the OS
   toast focuses Firefox's window and the page's `onclick` runs.
6. Corpus: the Linux apps pages, status and log.

## Files you OWN

- `apps/backend/src/modules/linux-apps/dbus/notifications.ts`,
  `session-bus.service.ts` and their specs
- `apps/core/src/modules/linux-windows/` (`linuxNotifications.ts`,
  `connection.ts`) and their tests
- the corpus pages in step 6

## Acceptance

- The tests above pass.
- The walk: the click reaches the page's `onclick`, and the toast closes.
- **Owner steps:** push this repo, then `node cli.ts imbatranim-os all`
  from vps-deploy.
