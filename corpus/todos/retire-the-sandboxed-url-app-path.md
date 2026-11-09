---
title: Retire the sandboxed path for apps from a URL
created: 2026-11-09
status: open
tags: [imbatranim-apps, marketplace]
---

# Retire the sandboxed path for apps from a URL

Since 2026-11-09 an app from a URL builds from source and runs natively once
it is verified or trusted (`imbatranim.json` version 2). The prebuilt,
sandboxed kind (version 1) still installs, and URL apps installed that way
keep working. Once none is installed and no repository ships a version 1
file, remove the path: the opaque-origin frame, its runtime and per-window
tokens, the sandbox's headers, its share of the keyboard guard, and the
version 1 manifest.

## Context

Owner decision 6 of brief 74
([decisions-app-identity-and-trust.md](../wiki/decisions-app-identity-and-trust.md#url-apps-run-natively-once-trusted-revisits-2026-10-07)):
there is no sandboxed option for new installs, and the frame goes in its own
step once nothing uses it. A sandboxed install left on a machine would need a
note in Settings, or an uninstall, when the path goes.
