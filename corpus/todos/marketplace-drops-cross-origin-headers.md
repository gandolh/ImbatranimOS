---
title: The Marketplace proxy should drop cross-origin isolation headers
created: 2026-11-06
status: open
tags: [imbatranim-apps, security]
---

# The Marketplace proxy should drop cross-origin isolation headers

Found while building brief 67. `DROPPED_RESPONSE_HEADERS` in
`marketplace.controller.ts` does not list `Cross-Origin-Opener-Policy`,
`Cross-Origin-Embedder-Policy` or `Cross-Origin-Resource-Policy`. A service
app's server could therefore overwrite the COEP the desktop sends on its own
responses, weakening the isolation brief 67 turned on. Add the three to the
list, with a test, or decide it is acceptable for a trusted app. Brief 74 is
another place it could land.
