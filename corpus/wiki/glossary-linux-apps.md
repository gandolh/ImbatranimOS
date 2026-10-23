---
summary: Vocabulary for Linux GUI apps shown as OS windows (2026-10-23) — Linux app and Wayland host, and the synonyms they displace (native app, the Rust compositor). The rest of the vocabulary is in glossary.md.
updated: 2026-10-23
---

# Glossary: Linux apps

Split from [glossary.md](glossary.md), same rules: definitions only, one name
per concept, the synonyms it displaces under _Avoid_. The calls behind these
terms are in [decisions-linux-apps.md](decisions-linux-apps.md).

**Linux app**:
A GUI program installed in the container's Linux, not written for the
desktop, whose windows the compositor shows as OS windows. Firefox is the
first one. See [decisions-linux-apps.md](decisions-linux-apps.md).
_Avoid_: native app (the marketplace's *native* means an app that runs in the
page unsandboxed), X app, remote app, desktop app.

**Wayland host**:
The Rust process that Linux apps connect to as their display. It accepts their
windows and passes images out and input in; it is not the compositor, which
stays in the browser.
_Avoid_: compositor, display server, window server, the Rust compositor.
