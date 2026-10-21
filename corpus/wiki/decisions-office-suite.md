---
summary: The office apps leave the OS for their own repo, imbatranim-office, written in TypeScript with editing in the browser and installed from the marketplace as one Office entry. Settled with the owner 2026-10-21 in place of brief 161's sandboxed craft windows.
updated: 2026-10-21
---

# Decisions: the office suite (2026-10-21)

Settled with the owner on 2026-10-21. They replace brief 161's proposal, which
put the ArtCraft crafts in the OS as wasm canvases in sandboxed frames. Changing
one needs an explicit revisit and a `log.md` entry.

## The office apps live in their own repo, imbatranim-office
_2026-10-21_ — Docs, Sheets, Slides, PDF and a new CAD app move out of
`apps/add-ons` into a separate repo, `imbatranim-office`, and come back through
the marketplace. PDF is PDF Viewer and norPDF merged into one app. Each app's UI
mounts natively in an OS window, as Hollow's does, not in an iframe.
Rejected: the crafts in sandboxed frames (brief 161, option A), and keeping the
office apps built in.
**Why**: the owner wants an OS whose every app is web UI, and a canvas in a
frame neither looks nor behaves like one; every craft also needed a bridge
patch. The suite becomes its own product, the way game-engine's games are.
- *Consequence*: the suite repo is AGPL-3.0, because Docs uses SuperDoc.
- *Consequence*: an OS without the suite installed has no office editor.

## TypeScript engines, editing in the browser; the crafts are a reference
_2026-10-21_ — Every app is TypeScript. The engine that edits a document runs in
the browser. A server (Fastify), where an app needs one, does one-off jobs:
conversion, PDF export, thumbnails. The ArtCraft crafts are the reference for how
features behave and how they are built, not a dependency.
Rejected: the crafts' Rust engines behind an API now with a TypeScript rewrite
later; all the work in the API, with every edit sent over the WebSocket.
**Why**: the cost is the UI, which is rebuilt either way. Editors call their
engine on every keystroke and pointer move, so a network hop makes Word-style
layout and CAD lag. The image has no compiler and the marketplace forbids
prebuilt binaries, so a Rust server needed two more revisits. The craft engines
are 93k–201k lines each, with no stable API, and change daily. A later rewrite
builds every app twice.
- *Consequence*: "Client-side JS engines only" in
  [decisions-pivot-era.md](decisions-pivot-era.md) is narrowed. Editing engines
  stay client-side; a suite app may run a marketplace service server for one-off
  jobs. Still no OnlyOffice, Collabora or LibreOffice.
- *Consequence*: code translated from a craft keeps its MIT/Apache notice in a
  third-party notices file. The ArtCraft name and logos are never used.

## One Office entry installs the whole suite
_2026-10-21_ — The catalog gets one entry for imbatranim-office. Installing it
clones and builds the repo once and registers all five apps; the owner switches
off the ones they don't want, as with any app.
Rejected: five entries that each clone and build the repo (works today, but five
copies of SuperDoc, Univer and pdf.js), and five entries sharing one checkout
(more OS work, tracking which apps still use it).
**Why**: one build, and choosing app by app already exists as enable and disable.
- *Consequence*: the OS learns "one descriptor, several apps", and gives
  marketplace apps what the built-in office apps have today: several windows
  (marketplace apps are forced to `multiInstance: false`), Open With (`opens`),
  and icons beyond the twelve game ones.

## The desktop shares its React and UI kit with marketplace apps
_2026-10-21_ — When the desktop mounts a native marketplace app, it hands it the
desktop's own React and `@imbatranim/ui`. Suite apps use those instead of
bundling their own, so they look and restyle exactly like built-in apps.
Rejected: the suite bundling a copy of the kit pinned from the OS repo (a React
per app, and restyles arrive only on a pin bump); a separate suite kit styled
with the OS's theme variables (most drift, and the moved apps' kit code is
rewritten).
**Why**: the point of moving the apps is that they stay OS apps. The coupling
this creates (the suite is built against an OS version) is acceptable because
the owner controls both repos and the catalog pins a commit.
- *Consequence*: reverses the marketplace rule that a module "cannot import the
  desktop's React or `@imbatranim/ui`; bundle what it needs"
  ([`marketplace/README.md`](../../marketplace/README.md)). The kit becomes a
  contract the OS has to version.
