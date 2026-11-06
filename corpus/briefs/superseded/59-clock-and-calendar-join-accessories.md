> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [clock-and-calendar-join-accessories](../../todos/clock-and-calendar-join-accessories.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 59 — Clock and Calendar join Accessories

## Context

Two of the apps
[research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
found blocked:

| App | Source / tests | Backend module | Hooks | System calls |
|---|---|---|---|---|
| Clock | 2,132 / 609 | `clock` (544 lines: world clocks, alarms, import) | `background` (alarms), a widget | `http`, `intents`, `notify`, `schedule` |
| Calendar | 3,266 / 1,184 | `calendar` (532 lines: events, import) | `background` (reminders), the Agenda widget | `fs`, `http`, `intents`, `notify`, `schedule` |

Brief 54 lets a catalog app bring a background service and widgets. Their
data stays where it is (decision 1). The owner approved moving them on
2026-11-06 ("looks good, write the briefs").

Follow the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

Brief 54 (the hooks) and brief 56 (the Accessories group).

## Owner decisions

1. **The backend modules stay in the OS.** Not yet confirmed: this is
   Claude's default from 2026-11-06, and the owner can overrule it. `clock`
   and `calendar` stay in `apps/backend`, and the installed apps call them as
   before. Alarms, events and world clocks survive an uninstall and come back
   on reinstall, and nothing is migrated. Rejected for now:
   - a per-app store in the OS;
   - files in the home folder;
   - a server in the Accessories group.

   See the checklist page.
2. **Widgets after an uninstall.** A placed widget's spot is kept in the
   desktop's dotfile, and the widget shows again when the app comes back,
   like a pinned icon. Default: yes.

## What to do

1. The checklist's steps 1-4 for both apps, added to `accessories.json` with
   a new pin. Each declares `background: true` and its widget (brief 54's
   fields) and exports them by name.
2. Background services keep claiming each occurrence through
   `claimScheduleOccurrence` before they notify, so two tabs still don't
   both toast it.
3. The walk (checklist step 6):
   - the before state is an alarm two minutes ahead, a reminder, a world
     clock, both widgets on the desktop, and Calendar on the startup list;
   - after removing them, nothing fires, the widgets are gone, and the
     desktop doesn't break;
   - after installing Accessories with no window open, the alarm fires, the
     reminder fires once with two tabs open, and the widgets are back in
     place;
   - after uninstalling and reinstalling, the data is still there.
4. Sign-in time with Accessories installed, compared with brief 54's
   numbers. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: the two apps in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, the two
  `apps/add-ons/` folders (deleted), their `manifest.ts` lines,
  `package-lock.json`, the corpus pages

## Files you must NOT touch

- `apps/backend/src/modules/clock/`, `calendar/` and `schedule/`, per
  decision 1.
- The widget host, apart from decision 2 if it needs a change.

## Acceptance

- Tests green in both repos; the walk holds, the data survival included.
