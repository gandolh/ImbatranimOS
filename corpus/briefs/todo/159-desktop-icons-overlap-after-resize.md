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
