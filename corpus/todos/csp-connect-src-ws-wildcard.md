---
title: CSP connect-src allows any ws:/wss: host
created: 2026-07-17
status: captured
tags: [security, backend, csp]
---

# CSP connect-src permits any WebSocket host

Found in the 2026-07-17 review pass (SEC-9). The Content-Security-Policy
`connect-src` directive is `'self' ws: wss:`
(`apps/backend/src/security-headers.ts:36`). The bare `ws:`/`wss:`
wildcards allow a WebSocket connection to any host, so if an XSS were ever
achieved this would be an open exfiltration channel to an
attacker-controlled server.

Deferred because the broad `ws:`/`wss:` allowance is a documented
cross-browser workaround for the terminal WebSocket, not an oversight —
see the comment at `apps/backend/src/security-headers.ts:16-19`, which
notes the wildcards are kept explicit so the terminal (`/api/pty`)
connects regardless of how each browser treats `'self'` for WebSocket
origins. Tightening it risks breaking the terminal in some browsers and
needs cross-browser verification.

Suggested approach: scope `connect-src` to the same origin — drop the
bare `ws:`/`wss:` wildcards and rely on `'self'` (or list the explicit
origin) — then verify the terminal still connects on the target browsers.

Rated informational: it only becomes exploitable given a separate XSS,
and `script-src 'self'` already keeps that surface small. This is the
mitigation that keeps it non-urgent.
