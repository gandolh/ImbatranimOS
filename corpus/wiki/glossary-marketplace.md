---
summary: The vocabulary for apps that come from outside this repo: marketplace catalog, descriptor, suite descriptor, marketplace app, kit app, shared kit, URL app and app manifest, and imbatranim-office, with the synonyms each displaces and two proposed terms that were never adopted. Split out of glossary.md on 2026-10-21.
updated: 2026-10-21
---

# Glossary: apps from outside the repo

Same rules as [glossary.md](glossary.md): one name per concept, definitions
only, and a word used against its entry here is a finding. Mechanism lives in
[decisions-marketplace.md](decisions-marketplace.md),
[decisions-office-suite.md](decisions-office-suite.md) and
[`marketplace/README.md`](../../marketplace/README.md).

**Marketplace catalog** (brief 120):
The repo's `marketplace/` directory, the trust anchor. Only an app described
there, at the commit it pins, installs natively.
_Avoid_: registry (that is `APP_REGISTRY`), app store.

**Descriptor**:
One reviewed `<id>.json` in the catalog. It names one repo at one commit, how
to build it, and the apps that build provides: exactly one for
`schemaVersion: 1`, one or more for version 2 (brief 162). Its id names the
install: the build directory, the log, the server.
_Avoid_: manifest (an add-on's object, or a URL app's file), config, entry (in
the schema, `entry` is an app's module path).

**Suite descriptor** (brief 162):
A descriptor with an `apps` array: one install, one build, one server at most,
and several apps in Start. imbatranim-office is the first.
_Avoid_: Office entry, suite entry, bundle, pack, multi-app entry.

**Marketplace app**:
One app installed from a descriptor, built on the machine and run natively in
the desktop's page. It has its own id, window sizes, icon, `opens` and
capabilities; its descriptor's id is what installs and removes it.
_Avoid_: add-on (an add-on is built in), plugin, extension.

**Kit app** (brief 163):
A marketplace app whose module exports a React component, which the desktop
renders in its own tree with the shared kit, so it looks and behaves like an
add-on. The other native kind hands its module a DOM node through `mount`, as
Hollow does.
_Avoid_: React app, component app, embedded app.

**Shared kit** (brief 163):
What the desktop lends every kit app at runtime: its own React, React DOM and
`@imbatranim/ui`, versioned together as `SHARED_KIT_VERSION`. It contains the
[kit](glossary.md#the-seam) but is not the same word: the kit is the
component set, the shared kit is the versioned bundle of instances an outside
build compiles against.
_Avoid_: SDK, runtime, shared deps, "the kit" when the versioned set is meant.

**imbatranim-office**:
The separate repo that holds the office apps (Docs, Sheets, Slides, PDF and
CAD) from 2026-10-21, installed through one suite descriptor. "Office" is that
descriptor's display name, not the repo's. Its own corpus holds the suite's
vocabulary.
_Avoid_: the craft suite, the office add-ons (true only until each app is
retired, brief 164).

**URL app** / **app manifest** (brief 158):
An app installed from its own repo's URL, unreviewed, prebuilt and run in a
sandboxed frame; the `imbatranim.json` it carries.
_Avoid_: sandboxed app (the sandbox is how it runs, not what it is), add-on or
plugin.

## Proposed, never adopted

Brief 161 (superseded 2026-10-21) proposed **craft app** and **document
grant**. Neither was built and neither term exists. Do not use them.
