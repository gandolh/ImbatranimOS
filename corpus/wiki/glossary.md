---
summary: The project's vocabulary — the terms ImbatranimOS uses in a specific way (add-on, core vs ui, the system handle, capability vs library, desktop layer, widget, background service, intent, dotfile, session, accent) with the synonyms each one displaces, plus the three terms that carry two live meanings and how to tell them apart.
updated: 2026-08-23
---

# Glossary

One canonical name per concept, with the synonyms it displaces. Definitions
only — *what a thing is*, never how it works; mechanism lives on the concept
page each entry links to. Only terms this project uses in a **specific** way
earn an entry; general programming words do not.

A term used against its definition here is a **finding**, not a typo — fix one
side rather than quietly widening the definition. Two live meanings for one
word are two terms; the three that exist are called out under
[Terms that split](#terms-that-split).

## The app layer

**Add-on**:
A windowed application, shipped as its own npm workspace package under
`apps/add-ons/<app>` (`@imbatranim/<app>`) and exporting exactly one
`manifest`. Adding one to the OS is a new package plus one line in the
composition root — nothing else in core changes.
_Avoid_: plugin, extension, module, "an app" when the package is meant.

**Manifest**:
The `AddonManifest` object an add-on exports — its whole registration contract
([`apps/core/src/contract.ts`](../../apps/core/src/contract.ts)): id, name,
icon, component, sizes, `opens`, and the optional `desktopLayer` / `background`
/ `widgets` / `commandSources` seams.
_Avoid_: config, descriptor, plugin definition. Do **not** call
`apps/core/src/manifest.ts` "the manifest" — that file is the composition root.

**Composition root**:
[`apps/core/src/manifest.ts`](../../apps/core/src/manifest.ts) — the one file in
core permitted to import add-on packages (eslint-enforced), which aggregates
their manifests into `APP_REGISTRY` and registers their command sources.
_Avoid_: the manifest, the registry file, the barrel.

**Registry**:
`APP_REGISTRY` — the ordered list of registered `AppConfig`s. Order is
load-bearing: the first app claiming a file extension wins when the user has
not chosen.
_Avoid_: app list, catalog, app store.

**Widget**:
A small, always-visible desktop panel an app contributes via `widgets`. It is
**hosted** — core owns placement, drag, clamping and persistence — and is fixed
size in v1.
_Avoid_: gadget, tile, applet, panel.

**Desktop layer**:
One free-form surface an app paints itself on the desktop beneath every window
(`desktopLayer`), mounted whether or not the app has a window open. Sticky
Notes is the worked example.
_Avoid_: overlay, backdrop, canvas, widget (a widget is hosted; a layer is not).

**Background service**:
A headless, desktop-lifetime component (`background`) mounted from login to tab
close, rendering nothing and existing purely for effects — alarms, reminders,
due dates.
_Avoid_: daemon, worker, cron, agent. (Real daemons are on the standing
rejection list in [real-os-gaps.md](real-os-gaps.md).)

## The seam

**`system` handle** (`SystemHandle`):
The capability object the compositor mints per app and injects at mount — the
app↔OS protocol seam. An app receives it; it imports nothing from core to get
it. The TypeScript interface at
[`packages/ui/src/system.ts`](../../packages/ui/src/system.ts) **is** the
protocol spec. Design: [os-layering.md](os-layering.md).
_Avoid_: context, bridge, API object, SDK client, "the core API".

**Capability**:
Anything reachable on the `system` handle — a data call or an effect that
crosses the seam (`fs`, `http`, `window`, `intents`, `shortcuts`, `appearance`,
`schedule`, `notify`, `on`). The test is the **bisection rule**: can it travel
over `postMessage`? If yes, it is a capability.
_Avoid_: permission, service, core function.

**Library**:
The other half of the bisection rule — a component or a pure-client hook, which
cannot travel over `postMessage` and is therefore a build-time import from
`@imbatranim/ui`, never a capability. Linking it is like linking GTK, not like
making a syscall.
_Avoid_: kit (see below), utils, shared code.

**Kit**:
The house component surface exported by `@imbatranim/ui` — `Button`, `Input`,
`Checkbox`, `Dialog`, `Select`, `ScrollArea`, `Tooltip`, `ContextMenu`,
`ConfirmDialog`, `PromptDialog`, `cn`, plus the pure-client hooks. A "kit"
component is a *library* in the bisection sense; the two words are not rivals,
kit names the set and library names the category.
_Avoid_: design system, component library, ui package (when the set is meant).

**Syscall bridge**:
The NestJS backend — the only path to the real system (FS, PTY, `/proc`, HTTP
proxy), and the layer-1 half of the three-layer model. It streams **data**,
never pixels.
_Avoid_: the server, the API (both are true but say less), the host.

**Compositor**:
Core's window manager — window chrome, z-order, focus, input routing, taskbar.
Client-side by physical necessity. "The shell" is the informal name for the
same thing plus the desktop chrome around it; prefer *compositor* when the
seam or window management is what's at stake.
_Avoid_: window manager (in prose — the code's `windowStore`/`window-manager`
keep the name), desktop environment.

**Intent**:
A payload handed to an app when it is launched or focused — the thing
`openApp(appId, payload)` sends and `system.intents.consume()` drains. Pending
intents survive until the target window mounts (redelivery).
_Avoid_: message, event, args, deep link.

**Association**:
The extension → app mapping an add-on declares itself via `opens`, plus the
user's "always open this type with…" override. The `.desktop` `MimeType=`
analogue.
_Avoid_: file handler, mime map, default app table.

## State and identity

**Dotfile**:
Durable, server-side user config — appearance, wallpaper, desktop icon
positions, disabled add-ons, association overrides — stored in the backend
`prefs` table inside the `$HOME` volume and shared across every session, the
way `.bashrc` is shared across SSH logins. Owner-only; never `@Public()`.
_Avoid_: setting, preference, localStorage value, profile.

**Session**:
One browser tab — an ephemeral, in-memory desktop whose window layout is born
at open and dies at close, with nothing shared between tabs. There is
deliberately no reattach and no server-side session state.
_Avoid_: tab state, workspace, layout. See [Terms that split](#terms-that-split).

**Accent**:
The single user-chosen colour of an otherwise black-and-white identity, stamped
on `<html>` as the `--accent` CSS var at runtime. Four presets, crimson by
default. A hex literal is not an accent — it does not track the choice.
_Avoid_: primary colour (the token is `primary`; the *concept* is the accent),
theme colour, brand colour.

**Token**:
A semantic colour class (`surface-container-low`, `on-surface-variant`,
`outline-variant`, `primary`) — the only permitted way to name a colour. Light
mode is the same token names swapped, which is why a `dark:` variant is always
wrong. Full list: [ui-conventions.md](ui-conventions.md).
_Avoid_: palette colour, variable, theme value.

**Friend-run bar**:
The finish line: a tech-tolerant friend with Docker runs one documented
command, opens a browser, logs in, and uses the OS — with no help from the
author. It replaced the ISO era's friend-*install* bar.
_Avoid_: MVP, v1 criteria, done.

**Real, not simulated**:
The project's load-bearing soul rule — the terminal is a real PTY, the file
manager is the real filesystem, the monitor reads real `/proc`. Anything that
fakes the system is off-soul and gets rejected on those grounds alone, before
any feature argument.
_Avoid_: authentic, native, "actually works".

## Terms that split

Three words carry two live meanings here. Each pair is genuinely two concepts —
say which one you mean.

- **core** — the *package* `@imbatranim/core` is **type-only** after brief 48:
  the add-on contract and nothing else, so importing it can never couple an app
  bundle to the OS. The *directory* `apps/core/` is the desktop shell itself
  (compositor, taskbar, settings, auth, command palette). Values live in
  `@imbatranim/ui`. Say "core the package" or "the shell".
- **session** — a *desktop session* is one browser tab (above). An *auth
  session* is the `imb_session` httpOnly cookie that says you are logged in.
  They have unrelated lifetimes: closing a tab ends the first, not the second.
- **manifest** — an add-on's exported `AddonManifest` object vs the composition
  root file `apps/core/src/manifest.ts`. Use *manifest* for the object and
  *composition root* for the file.

## Where the rest lives

Locked calls and their reasons: [decisions.md](decisions.md) (plus
[pivot-era](decisions-pivot-era.md) and [iso-era](decisions-iso-era.md)).
The seam's design: [os-layering.md](os-layering.md). Style rules that use this
vocabulary: [ui-conventions.md](ui-conventions.md). Corpus-side vocabulary
(brief, todo, log, wiki) is defined in [CLAUDE.md](../CLAUDE.md), not here.
