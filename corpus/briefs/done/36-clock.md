# Brief 36 — Clock add-on

Status: **todo** · Promotes [clock-addon](../../todos/clock-addon.md). Wave C.
Easy → sonnet. New package `apps/add-ons/clock/`. **First real caller of the
notification center (brief 34)** — alarms/timers fire `notify(...)`.

## Problem

The tray shows the time but there is no clock app: no world clocks, stopwatch,
timer, or alarm. Pure client-side.

## Decisions (grilled 2026-07-18)

- **Four tabs**: Clock (large local time/date + a user-managed list of world
  clocks), Stopwatch (start/stop/lap/reset, centisecond precision), Timer
  (countdown with presets + custom, start/pause/reset), Alarm (list of daily
  alarms, enable/disable).
- **World clocks via `Intl.DateTimeFormat({ timeZone })`** — NO dayjs-timezone
  dep. Ship a small curated IANA-zone picker (Select from the core UI kit).
- **Alarms/timers hook the notification center**: when a timer hits 0 or an
  alarm's time arrives, call `notify({ title, body, appId: 'clock', level:
  'info' })` from `@imbatranim/core`. **Only fires while the desktop tab is
  open** — no background daemon; state this in the UI (a small note).
- **Persist** world-clock list + alarms in a `zustand` `persist` store
  (`imbatranimos:clock`). Stopwatch/timer live state is session-only.
- **Timing**: drive countdown/stopwatch off timestamps (compare `Date.now()`),
  not by accumulating `setInterval` ticks, so drift/throttling doesn't skew it.
  Alarm check: a single interval (~1/sec while open) comparing wall-clock HH:mm;
  guard against double-firing within the same minute.
- Single-instance app. Deps: `@imbatranim/core`, `lucide-react`, `zustand`
  (already hoisted).

## Fix

New package `apps/add-ons/clock/` (copy an add-on's scaffold). `src/index.ts`
manifest (`icon: Clock`, lazy component, `multiInstance: false`).
`src/Clock.tsx` shell with tab state; `src/tabs/{WorldClocks,Stopwatch,Timer,
Alarms}.tsx`; `src/clockStore.ts` (persisted). Alarm/timer fire path imports
`notify` from `@imbatranim/core`.

## Must preserve (regression surface)

Tray clock unchanged (this is the app behind it; wiring the tray to launch it is
optional and out of scope). Notification center API used exactly as exported
(`notify`), no changes to core. Timers must clear on unmount (no leaked
intervals).

## Verify bar

`turbo typecheck`, clock lint + format green, build ok (own lazy chunk).
**Human-gated:** world clocks show correct offsets; stopwatch/timer accurate
across tab-switch; a fired timer/alarm raises a real toast + history entry;
persistence survives reload; no stale interval after closing the window.

## Invariants

Lightweight (no timezone lib — Intl only), identity locked, client-only.
"Only-while-open" limitation surfaced honestly in the UI.

## Out of scope

Background/OS-level alarms, calendar reminders (brief 40 owns those), stopwatch
history export, alarm sounds (no audio asset budget — visual notification only).

## Outcome (2026-07-18) — Wave C commit `a7632ab`

Shipped. `apps/add-ons/clock/`: four tabs (Clock+world clocks via
`Intl.DateTimeFormat`, Stopwatch, Timer, Alarms). Stopwatch/timer driven off
`Date.now()` timestamps in a persisted store (session-only live state) so they
survive tab-switch without drift; world-clock list + alarms persist
(`imbatranimos:clock`). A single app-wide 1 s interval (mounted in `Clock.tsx`)
fires `notify({ appId: 'clock' })` on alarm/timer expiry, minute-key-guarded
against double-fire; honest "only while open" note in the Alarms UI. Intervals
cleaned on unmount. No new deps. Own lazy chunk (4.52 KB gz). First real
notification-center caller. Human-gated accuracy/fire check open.
