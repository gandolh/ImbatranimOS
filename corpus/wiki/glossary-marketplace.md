---
summary: The vocabulary for apps that come from outside this repo: marketplace catalog, descriptor, suite descriptor, marketplace app, kit app, shared kit, group (2026-11-06), URL app and app manifest, and imbatranim-apps, with the synonyms each displaces and two proposed terms that were never adopted. Split out of glossary.md on 2026-10-21.
updated: 2026-11-09
---

# Glossary: apps from outside the repo

Same rules as [glossary.md](glossary.md): one name per concept, definitions
only, and a word used against its entry here is a finding. Mechanism lives in
[decisions-marketplace.md](decisions-marketplace.md),
[decisions-office-suite.md](decisions-office-suite.md) and
[`marketplace/README.md`](../../marketplace/README.md).

**Marketplace catalog** (2026-10-06):
The repo's `marketplace/` directory, the trust anchor. Only an app described
there, at the commit it pins, installs natively.
_Avoid_: registry (that is `APP_REGISTRY`), app store.

**Descriptor**:
One reviewed `<id>.json` in the catalog. It names one repo at one commit, how
to build it, and the apps that build provides: exactly one for
`schemaVersion: 1`, one or more for version 2 (2026-10-21). Its id names the
install: the build directory, the log, the server.
_Avoid_: manifest (an add-on's object, or a URL app's file), config, entry (in
the schema, `entry` is an app's module path).

**Suite descriptor** (2026-10-21):
A descriptor with an `apps` array: one install, one build, one server at most,
and several apps in Start. imbatranim-office is the first.
_Avoid_: Office entry, suite entry, bundle, pack, multi-app entry.

**Marketplace app**:
One app installed from a descriptor, built on the machine and run natively in
the desktop's page. It has its own id, window sizes, icon, `opens` and
capabilities; its descriptor's id is what installs and removes it.
_Avoid_: add-on (an add-on is built in), plugin, extension.

**Kit app** (2026-10-21):
A marketplace app whose module exports a React component, which the desktop
renders in its own tree with the shared kit, so it looks and behaves like an
add-on. The other native kind hands its module a DOM node through `mount`, as
Hollow does.
_Avoid_: React app, component app, embedded app.

**Shared kit** (2026-10-21):
What the desktop lends every kit app at runtime: its own React, React DOM and
`@imbatranim/ui`, versioned together as `SHARED_KIT_VERSION`. It contains the
[kit](glossary.md#the-seam) but is not the same word: the kit is the
component set, the shared kit is the versioned bundle of instances an outside
build compiles against.
_Avoid_: SDK, runtime, shared deps, "the kit" when the versioned set is meant.

**imbatranim-apps**:
The separate repo that holds the apps installed on the OS, in groups. Office
(Docs, Sheets, Slides, PDF and CAD) is the first, from 2026-10-21, installed
through one suite descriptor. "Office" is that descriptor's and group's display
name, not the repo's. Its own corpus holds the vocabulary.
_Avoid_: imbatranim-office (the repo's name until 2026-11-06; the descriptor
keeps that id), the craft suite, the office add-ons (true only until each app is
retired, the built-in retirement (2026-10-28)).

**Group** (2026-11-06):
A suite descriptor for apps from imbatranim-apps that are installed together
and shown as one folder in Start: Office, Accessories, Games, Developer.
_Avoid_: bundle, pack, category; suite for the install unit (a suite
descriptor is the mechanism); folder for anything but Start's side of it.

**URL app** / **app manifest** (2026-10-07, revised 2026-11-06):
An app installed from its own repo's URL instead of the catalog; the
`imbatranim.json` it carries. Since 2026-11-06 it runs natively once verified
or trusted (built 2026-11-09, manifest version 2). The prebuilt kind (version
1), which ran in a sandboxed frame, was retired on 2026-11-09: refused at the
check, and an install left from before can only be uninstalled.
_Avoid_: sandboxed app (the sandbox is how it ran, not what it is), add-on or
plugin.

**Verified app** (2026-11-06):
A URL app listed in imbatranim-apps' `verified.json` at the commit the OS
release pins; it installs without a warning.
_Avoid_: signed, approved, official app (the catalog's own apps are
Marketplace apps).

**Trusted app** (2026-11-06):
An unverified URL app the owner chose to trust at a given commit after the
warning; a new commit needs trust again.
_Avoid_: allowed, whitelisted, sideloaded.

**App identity**, **instance** (2026-11-06):
The app id a running app acts as, like a Unix user, and one running copy of
it, like a pid. Files in the apps' data area carry an owner identity, a group
and a mode.
_Avoid_: uid, process, session (a session is the signed-in tab).

## Proposed, never adopted

The the craft suite in sandboxed windows work (2026-10-21) (superseded 2026-10-21) proposed **craft app** and **document
grant**. Neither was built and neither term exists. Do not use them.
