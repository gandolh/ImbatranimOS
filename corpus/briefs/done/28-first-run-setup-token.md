# Brief 28 — Optional setup token for first-run claim protection

Status: **done** (2026-07-17) · Promoted
[first-run-setup-account-claim](../../todos/first-run-setup-account-claim.md)
(SEC-2, 2026-07-17 review).

## Outcome (2026-07-17)

Opt-in `SETUP_TOKEN` shipped, default-OFF (perfect no-op vs before — verified
by the unchanged default-off e2e). When set: `GET /auth/status` returns
`setupTokenRequired`, and `POST /auth/setup` refuses (401, before any account
is created) unless `dto.token` matches, via a constant-time compare
(`timingSafeEqual` over SHA-256 digests of both sides, so length never leaks
and it never throws on mismatch). `SetupDto` gains an optional `token`. The
wizard learns the flag through the existing status path (authStore.refresh →
AuthGate → FirstRunWizard prop) and shows a required token field only when
needed — no second fetch. New `test/auth-setup-token.e2e-spec.ts` covers
required/missing/wrong/correct + flip-to-false-after-claim. Backend 80 unit +
34 e2e green. **Human-gated:** a real deploy with `SETUP_TOKEN` set showing
the field + rejecting a wrong token. (The token is the mitigation; note the
todo also listed a localhost-bind alternative — not taken, as it would break
legitimate remote first-run.)

## Problem

`POST /api/auth/setup` is `@Public` and creates the single user for whoever
calls it first on an unclaimed instance, then auto-issues a session. On a
public deploy an attacker who hits `/auth/setup` before the owner claims the
box owns it (terminal = RCE). This is trust-on-first-use inherent to
single-user first-run.

## Fix — opt-in `SETUP_TOKEN` (default OFF = current behavior)

Add an operator-controlled out-of-band token. When set, first-run setup
requires it; when unset, behavior is exactly as today (no regression, no
forced UX change). This is the least-breaking mitigation — deliberately
opt-in rather than a default localhost-bind that would break legitimate
remote first-run.

1. **env** (`config/env.schema.ts`): `SETUP_TOKEN: z.string().optional()`.
   Document: "set to a random secret (printed to your deploy logs / passed
   to the operator) to require it at first-run setup; leave unset for
   trusted networks."
2. **status** (`auth.controller.ts`): add
   `setupTokenRequired: !this.auth.isSetup() && !!this.config.get('SETUP_TOKEN')`
   to the `GET /auth/status` payload so the wizard knows to ask.
3. **setup gate** (`auth.controller.ts` `setup()`): if `SETUP_TOKEN` is
   configured, require `dto.token` to equal it using a **constant-time**
   compare (`crypto.timingSafeEqual` over equal-length buffers; treat
   missing/short as fail). On mismatch throw `UnauthorizedException` BEFORE
   `this.auth.setup(...)`. When `SETUP_TOKEN` is unset, skip the check.
4. **DTO** (`dto/auth.dto.ts` `SetupDto`): add `@IsOptional() @IsString()
   token?: string`.
5. **client** (`core/.../auth/api/authApi.ts`): `AuthStatus` gains
   `setupTokenRequired: boolean`; `setupPassword(password, token?)` sends
   `{ password, ...(token ? { token } : {}) }`.
6. **wizard** (`core/.../auth/FirstRunWizard.tsx`): when
   `setupTokenRequired`, show a required "Setup token" `Input` and pass it to
   `setupPassword`. Read the flag from wherever the wizard already learns
   status (AuthGate/authStore — wire it through; do not add a second status
   fetch if one exists). When not required, the wizard is unchanged.

## Verify bar

Existing backend tests stay green with `SETUP_TOKEN` unset (no behavior
change). Add coverage for the gate: setup rejected without/with-wrong token
and accepted with the right token when `SETUP_TOKEN` is set (a focused
controller/service test, or an e2e with a config override — whichever fits
the existing harness). `turbo typecheck`/`format`/lint green;
backend `jest` + e2e green. **Human-gated:** first-run over a deploy with
`SETUP_TOKEN` set shows the token field and rejects a wrong token.

## Invariants

No default password ever (unchanged). Auth-everywhere. The token is an
operator secret, never logged by the app; constant-time compare only.
