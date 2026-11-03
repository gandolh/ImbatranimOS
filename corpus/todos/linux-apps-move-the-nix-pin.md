---
title: Move the Nix pin to a newer release from the pane
created: 2026-11-03
status: open
tags: [linux-apps, nix, grill-first]
---

# Move the Nix pin to a newer release from the pane

Split from the first wave's leftovers on 2026-11-03; needs a grill with the
owner before a brief. The Linux apps come from one pinned nixpkgs commit, and
only a new image moves it. A button in Settings → Linux apps could move the
pin to a newer release.

Open for the grill: who may move it, what happens to installed apps (rebuilt
on the new pin, or kept until reinstalled), the search index built per commit,
the store's size while both pins are held, and how to go back.
