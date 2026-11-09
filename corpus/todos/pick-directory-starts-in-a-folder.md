---
title: The folder picker starts in a given folder
created: 2026-11-06
status: promoted
tags: [imbatranim-apps, kit, files]
---

# The folder picker starts in a given folder

The kit's `fs.pickDirectory` has no start-folder option, so Files' extract
dialog cannot pre-select the archive's folder and opens wherever the picker
opens by default. Found while building brief 66. Fix: an optional start path
on `pickDirectory`, a kit minor, then Files passes the archive's folder.
