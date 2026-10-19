# Brief 159 — Desktop icons overlap after a viewport resize

Status: **todo** · Found 2026-10-09 during the README screenshot pass. SMALL–MEDIUM ·
CORE (`apps/core/src/shared/components/desktop/`, `store/desktopStore.ts`). **The
finding is unconfirmed**: it was seen once in headless Chrome and not investigated.
Reproducing it is step one. Implement inline once the cause is known.

## Context

After the browser viewport was resized, the desktop icons drew on top of each other.
They stayed overlapped until the page was reloaded. Nobody has yet checked whether it
happens in a normal headed browser, which resize direction triggers it (shrink, grow,
or both), or whether icons the owner had dragged ("pinned") are involved.

## Step one: reproduce it

1. Start the dev server (`npm run dev`) and sign in. Use a fresh profile so no pinned
   icons are stored (`desktopStore` persists `iconPositions`; clear site data first).
2. Open the desktop at a tall viewport, for example 1440x900. Note the icon columns.
3. Resize to a short one, for example 1440x500, then back to 1440x900. Check the
   icons after each resize. Try the same in headed Chrome and in headless Chrome
   (for example through `agent-browser` with a viewport change).
4. Repeat with a few icons dragged to new spots first (pinned), then resize.
5. Record which case overlaps, and read each icon's position from the store
   (`localStorage` key of `useDesktopStore`) to see whether two icons share an
   `x,y` or only look close.

If it never overlaps, say so in the outcome note, explain what produced the
screenshot, and close the brief.

## Leads (read from the current code, not verified as the cause)

- **Re-placement runs on `requestAnimationFrame`.**
  `apps/core/src/shared/components/desktop/Desktop.tsx:108-112` debounces the
  `resize` listener through `requestAnimationFrame(place)`. A headless or hidden tab
  can pause or never fire animation frames, so `place()` would not run and the icons
  would keep their old layout until the next mount, which is a reload. This matches
  "stays overlapped until reload" best.
- **The icon animation also rides on animation frames.**
  `DesktopIcon.tsx:60` animates to `position.x/y` with `initial={false}`. If frames
  stall, an in-flight move can stop part way.
- **Pinned icons are never re-flowed or re-clamped on resize.**
  `place()` (`Desktop.tsx:90-103`) passes pinned positions through unchanged, and
  `setAutoPositions` (`desktopStore.ts:46-62`) skips pinned entries. Auto-placed icons
  re-wrap into fewer rows on a shorter viewport and can land on a pinned icon that sits
  off the grid, because `layoutIcons` marks only the one rounded grid cell of a pinned
  icon as taken (`layoutIcons.ts:37-42`). A pinned icon also stays where it was even if
  the new viewport no longer contains that point.
- **Bounds come from two sources.** `place()` reads `containerRef.clientWidth/Height`
  while the widget layer reads `useElementSize()` (`Desktop.tsx:53,229`). They should
  agree, but check that the container has its final size when `place()` runs.

## Expected behaviour

After any resize, no two icons overlap and none sit outside the visible desktop, with
or without pinned icons, and without a reload. Auto-placed icons re-wrap to the new
height. Pinned icons stay where the owner put them unless the viewport no longer
contains them, in which case they are clamped back in.

## Acceptance checks

- A unit test in `layoutIcons.test.ts` (and `desktopStore` tests if the store changes)
  for the confirmed cause: pinned icons off the grid, a shrinking height, no overlaps.
- A browser walk, headed and headless, of the reproduction steps above: no overlap
  after shrink, grow, and shrink-then-grow, with and without pinned icons.
- `npm run typecheck`, `npm run lint` and `npm test` in `apps/core` pass.

## Out of scope

- The icon grid's look, size or spacing, drag-to-pin behaviour, marquee selection, and
  Auto-arrange (brief 106).
- Window and widget clamping (briefs 96 and the window store).
- Anything in the backend.

## Outcome (2026-10-19)

**Reproduced, and fixed in `ad7bc2e`.** A fresh profile at 1440x900, resized to
1440x500 in headless Chrome: all 29 icons drew squeezed into four columns, 25
overlapping pairs, and they stayed that way. The store held the correct
4-row grid. Each icon's DOM transform was frozen part way to its cell (Sticky
Notes at `translateY(7.77px)`, its target 16), and animation frames were
running at 60 fps, so the `requestAnimationFrame` lead was not the cause.

**The cause was framer-motion, not our layout.** With `dragConstraints` set to
a ref, framer-motion's drag controls listen for window `resize` and observe
the constraint element. On each one they stop the element's running
animation and move it to the same fraction of the new bounds
(`scalePositionWithinConstraints`). Our re-placement starts the animation to
the new cell, and the next resize callback stops it there. The drag limits
are now numbers derived from the measured desktop size, which framer-motion
leaves alone. The drop is clamped against that same size.

**Two layout faults, confirmed in the same walk:**
- An icon pinned between cells (Paint dropped at 64,70) covers four cells,
  but only one was marked taken. After a reload at 500px tall, three auto
  icons sat on it. `layoutIcons` now marks every cell a pinned icon covers.
- A pinned icon below a shrunken desktop was clipped away by the layer's
  `overflow-hidden`. Pinned icons are now drawn clamped into the desktop
  (`clampToDesktop`), and the marquee hit-tests the drawn positions. The
  store keeps the owner's point, so the icon goes back when the desktop grows.

Placement now runs when the desktop's measured size changes (the box the
widgets already use), not on a window `resize` listener.

**Verified:**
- `layoutIcons.test.ts` adds four tests: an off-grid pinned icon at both
  heights, shrink, grow and shrink again with three pins, a pin clamped in,
  and the point restored on growth.
- `npm run typecheck`, `npm run lint` (no errors; one existing warning in
  `FilePicker.tsx`) and `npm test` in `apps/core` pass (456 tests).
- Browser walk against the local stack, headless and headed Chrome
  (`agent-browser`, viewport emulation 900 → 500 → 900 → 500 → 900). There were
  no DOM overlaps and no icon outside the desktop after each step, with and
  without pins (Paint at 64,70 and Solitaire at 708,776, clamped to y 376 at
  500px and back at 900px). A drag past the bottom-right corner is stored at
  1376,776.

**Not changed:** dropping a dragged icon onto others still overlaps them
until the next re-placement. That is drag-to-pin behaviour, which this brief
leaves out of scope.
