# Brief 34 — Notification center (CORE)

Status: **todo** · Promotes [notification-center](../../todos/notification-center.md)
(2026-07-17 daily-driver research pass). CORE shell surface, not an add-on —
like Settings. First platform brief of the daily-driver backlog; clock alarms
(36) and calendar reminders (40) are its first callers, so it lands before
Wave C.

## Problem

There is no way for an app to tell the user something happened out-of-window
(a timer fired, a long save finished, an extract errored). Apps would each
reinvent an ad-hoc UI. The OS needs one shared, tray-anchored notification
capability: transient toasts + a persistent history the user can review + a
do-not-disturb switch — with a public API add-ons call across the enforced
`@imbatranim/core` boundary.

## Decisions (grilled 2026-07-18)

- **Public imperative API on core's surface.** Export `notify(input) => id` from
  `apps/core/src/index.ts` — a plain function (mirrors `openApp`) so any code,
  React or not, can raise a notification: `notify({ title, body?, level?,
  appId? })`. Also export `useNotifications` (the zustand store hook) + the types.
  Adding to `index.ts` is a deliberate API decision, consistent with the barrel's
  contract.
- **One zustand store** `shared/store/notificationStore.ts`, `persist`-backed
  (`imbatranimos:notifications`) but **partialized**: only `notifications`
  (history) and `dnd` persist; the live `toasts` array is in-memory only — a
  toast must never reappear on reload. History is **bounded to 100** (drop
  oldest); ids via `crypto.randomUUID()`.
- **Levels**: `'info' | 'success' | 'warning' | 'error'`, driving the accent
  stripe/icon only — no new palette (reuse existing tokens; error = a red-ish
  token already in the theme, else the accent). Default `info`.
- **Toasts**: bottom-right, stacked above the taskbar (`TASKBAR_HEIGHT` = 44),
  auto-dismiss after ~6 s **except `error`** (sticky until dismissed). Dismissing
  a toast keeps it in history. Respect DnD: when DnD is on, `notify` still records
  to history but shows **no** toast.
- **History panel is tray-anchored** (Win7-classic): a bell button in `Tray`,
  left of the clock, with an unread-count badge, opening a `Popover` (same
  primitive as the clock's calendar) listing history newest-first with per-item
  level icon, title/body, relative time (`dayjs` is already in core). Panel
  actions: **Mark all read**, **Clear all**, and a **Do Not Disturb** toggle.
  Opening the panel marks visible items read. Clicking an item with an `appId`
  calls `openApp(appId)` and dismisses.
- **In-session only.** No background daemon, no push, no service worker (the
  todo's constraint). History persisting to localStorage across reloads is fine
  — it's the same identity as the persisted window layout/appearance.

## Fix

1. `shared/store/notificationStore.ts` — `NotificationItem`, `NotifyInput`,
   `NotificationLevel` types; state `{ notifications, toasts, dnd }`; actions
   `notify`, `dismissToast`, `markRead`, `markAllRead`, `remove`, `clearAll`,
   `setDnd`. `persist` + `partialize` to `{ notifications, dnd }`.
2. `shared/components/notifications/ToastHost.tsx` — fixed bottom-right stack
   of live toasts with auto-dismiss timers (cleared on unmount/manual dismiss);
   `error` sticky. Uses existing tokens + `cn`.
3. `shared/components/notifications/NotificationPanel.tsx` — the tray popover
   body (history list via `ScrollArea`, the three actions, DnD toggle).
4. `shared/components/notifications/index.ts` barrel; wire the **bell + badge +
   Popover** into `Tray.tsx` (left of the divider/clock).
5. Mount `<ToastHost />` in `App.tsx` (a sibling of `<Taskbar />`, high z-index
   under the taskbar's `z-[9000]` but above windows).
6. Export `notify`, `useNotifications`, and the three types from
   `apps/core/src/index.ts`.

## Must preserve (regression surface)

- Tray clock + mini-calendar, system-stats readout, and taskbar layout all
  unchanged — the bell inserts without shifting the clock's behavior.
- No add-on package changes this brief (callers wire up in their own briefs);
  the boundary rule stays intact — add-ons will import `notify` from
  `@imbatranim/core` only.
- Toasts must not block clicks on the desktop/taskbar outside their own bounds
  (pointer-events scoped to toasts, not the host overlay).
- Persisted window-layout/appearance stores are untouched; the new store uses
  its own localStorage key.

## Verify bar

`turbo typecheck` 13/13, core lint green, `format:check`, `turbo build` ok
(the new core surface compiles; no add-on touched). **Human-gated:** fire a test
`notify(...)` (e.g. from the palette or a temporary hook) → a toast appears
bottom-right and auto-dismisses (error stays); the tray bell shows an unread
badge; opening the panel lists history, marks read, Clear all empties it, DnD
suppresses new toasts while still logging history; reload keeps history, shows
no stale toast.

## Invariants

Win7-classic identity locked — bell lives in the tray, toasts bottom-right, no
redesign. Lightweight: no new dependency (zustand, dayjs, Base UI Popover, the
UI kit all already in core). Auth/FS untouched (pure client shell feature).

## Out of scope

Background/push notifications, a service-worker daemon, cross-device sync,
notification *actions/buttons* beyond click-to-open, and per-app notification
settings (that pairs with the future addon-manager, brief 46). Sound is out
(no audio asset budget this brief).

## Outcome (2026-07-18) — commit `82c635b`

Shipped as specified, all in `@imbatranim/core`. New
`shared/store/notificationStore.ts` (zustand + `persist`, `partialize` to
`{ notifications, dnd }` so live toasts never resurrect on reload; history
bounded to 100; `crypto.randomUUID()` ids) exposes `notify`, `dismissToast`,
`markRead`/`markAllRead`, `remove`, `clearAll`, `setDnd`. Public surface grew by
`notify(input) => id` + `useNotificationStore` + the three types on
`src/index.ts`. `ToastHost` renders a bottom-right stack above the taskbar
(`pointer-events-none` overlay, toasts `pointer-events-auto`; ~6 s auto-dismiss,
`error` sticky; cap 5 visible) mounted in `App.tsx`. `NotificationPanel` is the
tray popover (history via `ScrollArea`, Mark-all-read / Clear-all / DnD toggle,
click-an-item-with-appId → `openApp`); a `Bell` + unread badge in `Tray.tsx`
opens it and marks read. Level→visual is icon-only + accent/error token (no new
palette); a `LevelIcon` component + `levelStyle.ts` helpers are split across two
files to satisfy the react-refresh/static-components rules. Gates: typecheck
13/13, lint 14/14, format, build green; eager `index-*.js` gzip 121.5 → 125.1 KB
(+3.6 KB, the shell tray/toast host — expected, negligible). Human-gated
toast/panel/DnD/reload walkthrough open.
