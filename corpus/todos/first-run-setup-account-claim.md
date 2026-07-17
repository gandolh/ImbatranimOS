---
title: Unauthenticated first-run setup allows account claim on a fresh public instance
created: 2026-07-17
status: captured
tags: [security, backend, auth]
---

# First-run setup can be claimed by whoever reaches it first

Found in the 2026-07-17 review pass (SEC-2). The first-run setup endpoint
is public: `POST /api/auth/setup` is marked `@Public()`
(`apps/backend/src/modules/auth/auth.controller.ts:50-62`), and the
service creates the single user for whoever calls first while the box is
unclaimed (`apps/backend/src/modules/auth/auth.service.ts:62-71`, guarded
only by `!isSetup()`); the controller then auto-issues a session cookie
(`auth.controller.ts:60`).

On a public deploy, an attacker who reaches `/auth/setup` before the
legitimate owner claims the instance owns it outright — and since the
shell exposes a real PTY, owning the account is effectively RCE.

Deferred because every real fix is a product/UX decision, not a code
tweak:

- (a) require an out-of-band `SETUP_TOKEN` env var that must be supplied
  to `setup` — needs a new field in `FirstRunWizard` and a
  `needsSetupToken` flag surfaced on `/auth/status`; or
- (b) bind setup to loopback / private addresses until the box is claimed
  — which risks breaking a legitimate remote first-run.

Current mitigation / why it is not urgent: this is the trust-on-first-use
window inherent to any single-user first-run flow, and it closes
permanently the instant setup succeeds (re-running is a 409). The
practical guidance is to complete setup over localhost/LAN before
exposing the instance to the internet. Rated low–medium.
