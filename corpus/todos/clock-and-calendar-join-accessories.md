---
title: Clock and Calendar join Accessories
created: 2026-11-06
status: dropped
tags: [imbatranim-apps]
---

# Clock and Calendar join Accessories

Clock and Calendar join Accessories, bringing their background services and widgets through the new hooks. Their alarms, events and world clocks stay where they are.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

> DROPPED 2026-11-06 in the imbatranim-apps grill: Clock and Calendar stay built in and keep their backend modules.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); Clock and Calendar go to Accessories.

1. **Do their backend modules stay in the OS?** Answered 2026-11-06: no. Their data moves once into real files in the app's own folder, `~/.local/share/imbatranim/<app-id>/`, through [apps-get-a-data-folder-of-their-own](apps-get-a-data-folder-of-their-own.md), and the module is deleted.
2. **Does a placed widget keep its spot and come back when the app is reinstalled, like a pinned icon?** Proposed: yes.
3. **Should alarms and reminders still fire while Accessories is uninstalled?** Answered 2026-11-06: no. They belong to the apps and stop with them; a reinstall picks them up from the kept data. The uninstall prompt says how many alarms and reminders will stop.
4. **Which file format?** Proposed: JSON for both, with Calendar's ICS import and export kept as they are.

## Draft brief

> The draft below predates the 2026-11-06 grill and still says the modules stay. At promotion: add a one-time move of the module's data into the app's folder, delete the module, and depend on [apps-get-a-data-folder-of-their-own](apps-get-a-data-folder-of-their-own.md).

### Context

Two of the apps
[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
found blocked:

| App | Source / tests | Backend module | Hooks | System calls |
|---|---|---|---|---|
| Clock | 2,132 / 609 | `clock` (544 lines: world clocks, alarms, import) | `background` (alarms), a widget | `http`, `intents`, `notify`, `schedule` |
| Calendar | 3,266 / 1,184 | `calendar` (532 lines: events, import) | `background` (reminders), the Agenda widget | `fs`, `http`, `intents`, `notify`, `schedule` |

[The hooks todo](catalog-apps-bring-background-services-and-commands.md) lets a catalog app bring a background service and widgets. Their
data stays where it is (question 1). The owner approved moving them on
2026-11-06 ("looks good, write the briefs").

Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[The hooks](catalog-apps-bring-background-services-and-commands.md) and [Calculator, Paint and Snipping Tool](calculator-paint-and-snipping-tool-install-as-accessories.md)
(the Accessories group).

### What to do

1. The checklist's steps 1-4 for both apps, added to `accessories.json` with
   a new pin. Each declares `background: true` and its widget (the hooks todo's
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
4. Sign-in time with Accessories installed, compared with the hooks todo's
   numbers. Corpus (checklist step 7).

### Files you OWN

- in imbatranim-apps: the two apps in the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, the two
  `apps/add-ons/` folders (deleted), their `manifest.ts` lines,
  `package-lock.json`, the corpus pages

### Files you must NOT touch

- `apps/backend/src/modules/clock/`, `calendar/` and `schedule/`, per
  question 1.
- The widget host, apart from question 2 if it needs a change.

### Acceptance

- Tests green in both repos; the walk holds, the data survival included.
