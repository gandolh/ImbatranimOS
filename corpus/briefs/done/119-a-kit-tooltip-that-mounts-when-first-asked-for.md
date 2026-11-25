# Brief 119: A kit tooltip that mounts when first asked for

**Depends on:** nothing. **Runs after:** 118.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-24 from the performance sweep's round 21
([research-performance-sweep-5.md](../../wiki/research-performance-sweep-5.md)), where it was measured and not
built: it passed its bar on scrolling and missed it on opening a folder.

## Context

- `packages/ui/src/components/Tooltip.tsx` mounts Base UI's Provider, Root and Trigger for every tooltip, opened
  or not; Root and Trigger each set up a floating-ui context and hover and focus interactions. The kit is vendored
  by imbatranim-apps, so the change must keep `Tooltip`'s props (it does) and its behaviour.
- Measured 2026-11-24 with a 20,000-file folder in the File Manager (24 rows on screen, five tooltip-wrapped
  buttons each), medians of six:

| | Today | No tooltips at all (the bound) | Lazy tooltip |
|---|---:|---:|---:|
| A wheel step: main thread / script | 45.6 / 30.0 ms | 30 / 15 ms | 32.6 / 16.8 ms |
| Opening the folder: main thread | 154 ms | 131 ms | 144 ms |
| Heap growth opening it | 8.2 MiB | 5.6 MiB | 5.6 MiB |
| Paint's window opening (about 40 tooltips) | 98 ms | 62 ms | 78 ms |

- The design that was measured: the child renders alone until a mouse `pointerenter` or a focus; then Base UI's
  tooltip mounts, controlled, opening after the usual 400 ms if the pointer is still on the trigger (Base UI's
  trigger opens on `mouseenter`, which happened before it mounted), and putting focus back on the trigger after a
  focus (the child remounts inside Base UI's trigger). Non-element children keep today's path. In a real tab it
  behaved as today: nothing at 150 ms, shown at 800 ms, hidden on leaving, shown again on a second hover, shown on
  Tab focus with focus kept, and a click still acts.

## Decisions (the bar, before measuring again)

1. Ship only if a wheel step in the 20,000-file folder takes at least 20% less main thread and the heap grows at
   least 20% less opening it, with the behaviour above unchanged in both themes and on a phone layout.
2. The remount on arming is the risk: a kit app whose trigger holds state of its own would lose it. Check the
   kit apps in imbatranim-apps before shipping.

## Files you OWN

- `packages/ui/src/components/Tooltip.tsx` and its tests.

## Acceptance

- [ ] The numbers above measured again, the bar written first.
- [ ] The behaviour check passes in Apricot light and Classic dark.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.

## Outcome (2026-11-24)

**Built, without the remount** (`b8ece90`). The design measured in round 21 mounted Base UI's trigger on first
use, which remounts the child. Checking imbatranim-apps' kit apps found pdf's toolbar radios (`ToolRadio`, a Base
UI `Radio` in a `RadioGroup`): remounted, a radio still moved and chose with the arrow keys, but no radio kept
`tabIndex` 0, so the group fell out of the Tab order. The tooltip now never wraps or remounts its child: it renders
it with its own props and ref and adds handlers (a mouse resting 400 ms, keyboard focus, closing on leave, press,
blur and Escape), and mounts Base UI's root and popup only while open, anchored to the child. The props are
unchanged (`SHARED_KIT_VERSION` stays); the trigger no longer carries Base UI's `id` and `data-*` attributes.

**The bar was met.** The 20,000-file folder, six runs each, interleaved: a wheel step 42.0 to 31.7 ms of main
thread (median, -24%), the heap growing 8.1 to 5.7 MiB opening it (-30%), opening it 145 to 125 ms. In a real tab,
Apricot light, Classic dark and a phone layout gave the same answers before and after (nothing at 150 ms, shown at
800 ms, hidden on leaving, shown on a second hover, shown on Tab with focus kept, gone after Escape, a click still
renames). The kit's tests add a radio group under tooltips, a controlled toggle and a forwarded ref.

`npm run check` exit 0; `bash corpus/lint.sh` OK. brief-board isn't installed in this session, so the
`ready_for_deploy` move is the owner's. imbatranim-apps picks the kit up with its next `kit:sync`.
