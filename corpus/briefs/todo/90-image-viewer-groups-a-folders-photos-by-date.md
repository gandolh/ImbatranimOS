# Task 90: Image Viewer groups a folder's photos by date

**Depends on:** brief 89 (closed first; same repo). Nothing outside this repo.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of 2026-11-13
(`todos/image-viewer-groups-photos-by-date.md`). The owner asked for it while
grilling the self-hosted tools research in vps-deploy (the PhotoPrism
section) and settled when and where on 2026-11-13 (the backlog grill, answer 5).

## Context

- PhotoPrism indexes a folder of photos where it lies and keeps the files as
  the truth. imbatranimOS made the same call for app data: files on disk, no
  hidden store.
- Image Viewer is a built-in add-on (`apps/add-ons/image-viewer/`). Opened
  on a file, it shows that image and steps through the folder's other images,
  sorted by name (`ImageViewer.tsx`, the sibling list from `api/listDir.ts`,
  `GET /files?root=&path=`, whose entries carry `modifiedAt`).
- The backend's file read already honours HTTP Range (206 with
  Content-Range, `files.controller.ts`), so the add-on can read a photo's
  first bytes without a new endpoint.
- EXIF's `DateTimeOriginal` (tag 0x9003 in the Exif IFD, reached from IFD0's
  0x8769) sits in a JPEG's APP1 segment near the start of the file. The
  segment is at most 64 KB.

## Owner decisions (settled 2026-11-13)

1. **A "By date" view inside Image Viewer**, not a mode in Files.
2. **Photos without an EXIF date** (screenshots, edits) are dated by the
   file's modified time and grouped with the rest.
3. **No database and no index file.** The grouping is worked out when the
   folder opens.

Technical defaults (the controller's, by convention; record a change on the
ticket):

- **Read EXIF in the add-on**, through Range requests on the existing file
  read: at most 64 KB a photo, the first 16 KB unless the APP1 segment says
  the date lies further; at most six requests at a time. No new backend
  route, no new dependency: a small reader for JPEG's APP1/TIFF IFDs, both
  byte orders. Other formats (PNG, WebP, GIF, HEIC) use the modified time.
- **Groups are local calendar days, newest first**, and photos within a day
  newest first. The heading is the OS's date format; the year shows only
  when it isn't the current one. A day's count shows beside its heading.
- **The grid's thumbnails** are the files themselves, loaded lazily
  (`loading="lazy"`, `decoding="async"`), sized by CSS. A thumbnail endpoint
  is a later todo if a large folder proves slow; say so in the outcome.
- **Opening a photo from the grid** shows it in the viewer, and next and
  previous then follow the date order. Opened from Files as today, they keep
  today's name order.
- **While the dates are read,** the grid shows the photos grouped by
  modified time with a quiet "Reading dates… N of M" line, and regroups
  once when every date is in. It never regroups photo by photo.

## Files you OWN

- `apps/add-ons/image-viewer/src/`: `ImageViewer.tsx`, `api/` (a Range read
  beside `listDir.ts`), `lib/` (the EXIF date reader, the grouping), their
  tests and fixtures.
- This brief, `corpus/log.md`, `corpus/wiki/status.md`, the todo it came
  from (delete it at closeout: this brief replaces it).

## Files you must NOT touch

- `apps/backend/`: the Range read exists; a backend change is a stop-and-report.
- `packages/ui/src/` (the kit) and `apps/core/src/`: use the kit's
  components as they are.
- The other add-ons.

## What to do

**Part 1 (the logic, no UI):**

1. **The Range read.** A helper beside `listDir.ts` that asks for a byte
   range of one file through the system http capability and returns the
   bytes; a 200 (no range support) is read only up to the limit.
2. **The EXIF date reader** (`lib/`): JPEG bytes in, a local date-time or
   null out. Handles II and MM byte orders, an APP1 that isn't Exif, a
   missing Exif IFD, a truncated buffer (asks for more up to 64 KB, then
   null), and the `YYYY:MM:DD HH:MM:SS` string's blanks/zeros (null).
   Test fixtures are small hand-built byte arrays or tiny JPEGs made in the
   test, never real photos.
3. **The grouping** (`lib/`): entries plus their dates (EXIF or modified)
   in, day groups newest first out; day boundaries in local time. Tests:
   midnight edges, a mixed folder, an empty folder, equal times (stable by
   name).

Part 1 ends with a commit, `npm run check` exit 0, and a hand-off note
(below).

**Part 2 (the view):**

4. **The "By date" view.** A control in Image Viewer's toolbar switches
   between the single image and the grid (a kit `ToggleGroup` or the
   pattern the add-on's toolbar uses; the base-ui skill's rule 16: a view
   switch kept only on the device is a `RadioGroup`/toggle, not saved to the
   server). Opened on a file, the view starts as today; the grid covers that
   file's folder.
5. **Grid behaviour** as the technical defaults say: lazy thumbnails, the
   progress line, one regroup, day headings with counts, keyboard reachable
   (Tab into the grid, arrows move, Enter opens), and an empty state for a
   folder with no images.
6. **Walk it** in the dev container (`infrastructure-dev-1`, started, never
   recreated) with a seeded folder of about 40 generated images: JPEGs with
   EXIF dates over three days and two years, two PNGs, one JPEG without
   EXIF. Screenshots at 1280×800 light and 390×844 dark, in Apricot and
   Classic, grid and single view.

## Acceptance

- [ ] The reader's and the grouping's tests cover the cases in steps 2-3 and
      pass; `npm run check` exits 0.
- [ ] The seeded folder groups into the right days, newest first; the PNGs
      and the EXIF-less JPEG sit under their modified day.
- [ ] Each photo reads at most 64 KB for its date (the walk's network log
      or a test on the reader's request sizes shows it), six at a time at
      most.
- [ ] Opening from the grid steps in date order; opening from Files keeps
      name order.
- [ ] Nothing in the backend, the kit or core changed.
- [ ] Screenshots as step 6 lists, read by the builder: nothing clipped, no
      overflow at 390, the progress line and the empty state shown once.
- [ ] End move `ready_for_deploy`; owner step `node cli.ts imbatranim-os
      server` (the container serves the web client).

## Hand-off note between parts

Part 1 ends with a note on the ticket (`brief-board comment`) and in its
report: steps done, the next step, files touched, each check's state, and
anything learned that part 2 needs (the reader's API, the grouping's types,
the Range helper's name).
