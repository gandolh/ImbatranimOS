# Brief 40 — Calendar add-on

Status: **todo** · Promotes [calendar-addon](../../todos/calendar-addon.md).
Wave C. Medium → sonnet. New package `apps/add-ons/calendar/`. Second caller of
the notification center (reminders → `notify`).

## Problem

No calendar app: month/week views, create/edit events, reminders. A normal-user
staple.

## Decisions (grilled 2026-07-18)

- **Storage: the app's own `zustand` `persist` store** (`imbatranimos:calendar`),
  not FS files and not a backend module — keeps this a client-only Wave C brief
  (a backend/ICS story is a later brief if ever). Events owned by the user in
  localStorage.
- **Views**: Month (grid) + Week (time-column). Navigate prev/next/today. Click a
  day/slot to create; click an event to edit/delete. Event =
  `{ id, title, start, end, allDay, notes?, reminderMinutes? }`.
- **Reminders hook the notification center**: a single ~1/min interval (while the
  tab is open) fires `notify({ title: event.title, body: 'Starting soon', appId:
  'calendar', level: 'info' })` when `now` crosses `start − reminderMinutes`.
  Guard each event so it fires once per occurrence. **Only while open** — surface
  this limitation in the UI (same honesty as the clock).
- **Todo integration = deferred.** Do NOT couple to the Todo app's store this
  brief (cross-add-on import is forbidden anyway). Note a future "read-only Todo
  due-dates overlay" idea; ship the calendar standalone.
- **Dates**: `dayjs` (already hoisted) for month/week math is fine; or native
  `Date`. No timezone lib — local time only.
- Single-instance. Deps: `@imbatranim/core`, `lucide-react`, `zustand`, `dayjs`
  (all hoisted).

## Fix

New package `apps/add-ons/calendar/` (add-on scaffold). `src/index.ts` manifest
(`icon: Calendar` from lucide, lazy, `multiInstance: false`).
`src/Calendar.tsx` (view state + nav), `src/views/{MonthView,WeekView}.tsx`,
`src/EventDialog.tsx` (create/edit via core `Dialog`/`Input`/`Button`),
`src/calendarStore.ts` (persisted events + CRUD), `src/reminders.ts` (the
interval → `notify`). Token-styled, Win7-classic.

## Must preserve (regression surface)

No existing app changes (additive package + the controller's manifest entry).
Notification center used exactly as exported. Reminder interval cleared on
unmount; no double-fire. Editing/deleting an event updates both views.

## Verify bar

`turbo typecheck`, lint + format green, build ok (own lazy chunk).
**Human-gated:** create/edit/delete events; month↔week nav; a reminder fires a
real toast + history entry at the right time; events persist across reload; the
"only while open" note is visible.

## Invariants

Lightweight (no new dep), identity locked, client-only (no backend/auth surface
this brief).

## Out of scope

Backend/ICS sync, recurring events, invites/attendees, timezones, Todo-app
coupling, drag-to-reschedule (nice-to-have; skip unless trivial).

## Outcome (2026-07-18) — Wave C commit `a7632ab`

Shipped. `apps/add-ons/calendar/`: Month grid + Week time-column, prev/next/
today nav, create/edit/delete via core `Dialog` (+ `useConfirm` on delete).
Events in a persisted zustand store (`imbatranimos:calendar`, no backend/FS).
`useCalendarReminders()` — one 60 s interval, 90 s fire window past
`start − reminderMinutes`, fires `notify({ appId: 'calendar' })` once per
occurrence (guard flag re-armed on edit), cleared on unmount; honest "only while
open" footer note. Today cell styled like the tray MiniCalendar. dayjs pinned to
the sibling version (no new dep). Own lazy chunk (3.98 KB gz).
`multiInstance: false`. Todo-app coupling deferred. Second notification-center
caller. Human-gated CRUD/nav/reminder check open.
