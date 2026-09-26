# Brief 146 — Ward client: fail closed on a key-fetch outage, and carry the reference tests

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM · BACKEND
(`apps/backend/src/modules/ward/ward.client.ts` + a new spec). Independent.
Implement inline, or as two chunks (the fix; the test port).

## Context

1. **A Ward outage reads as "signed out" whenever the key set needs
   fetching.** `verify()` wraps `jwtVerify` in a catch-all
   (`ward.client.ts:171-172`) that throws `WardAuthenticationError`, a 401.
   jose's remote key set (`createRemoteJWKSet`, `:138`) fetches on first use
   and again once its 10-minute `cacheMaxAge` lapses, and a failed fetch —
   timeout, connection refused, non-200 — is thrown out of `jwtVerify`. So just
   after a restart, or more than 10 minutes after the last key fetch, an
   unreachable Ward yields **401, not 503**. The frontend then sends the user
   to a Ward login page that is down — exactly what the guard's header and
   Ward's `integrating.md` point 5 forbid ("never let any of them resolve as
   'not signed in'"). The terminal sweep treats it the same way and closes
   shells. Ward's reference client (`wzd_auth/client/src/verify.ts`) has the
   same catch; the contract page says to change the reference first, so raise
   it there too.
2. **None of the client's behaviour is tested.** There is no
   `ward.client.spec.ts`, and every e2e suite swaps in `FakeWardService`
   (`modules/ward/testing.ts`), whose `authenticate` is a re-implementation
   that never calls this file. The only branch any test reaches is "no
   cookie". Algorithm pinning, issuer/audience/required claims, the 30 s cache,
   collapsing concurrent calls, the Ward 401 → `WardConfigurationError`
   mapping, non-200 or malformed → unavailable, and cookie parsing all have
   zero coverage. The reference `wzd_auth/client/src` ships about 43 tests for
   exactly these (`verify.test.ts`: `alg: none`, HS256 signed with the public
   key, a foreign JWKS; `introspect.test.ts`: the TTL with an injectable
   clock, 50 concurrent calls → 1 request, configuration errors never cached).

## Files you OWN

- `apps/backend/src/modules/ward/ward.client.ts`
- a new `apps/backend/src/modules/ward/ward.client.spec.ts`, plus any
  test-only helper under `modules/ward/`

## Files you must NOT touch

- `ward.guard.ts` — its error mapping is right once the client throws the
  right class.
- The slug constant in `ward.types.ts` — brief 137.

## What to do

1. In `verify()`, separate token-validity failures from key-set availability
   failures, matching on jose's `code` property rather than message text, and
   **allowlist the token-validity side** so anything unrecognised fails closed
   as unavailable, never as "signed out". Token-validity (→
   `WardAuthenticationError`): `ERR_JWT_EXPIRED`,
   `ERR_JWT_CLAIM_VALIDATION_FAILED`, `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`,
   `ERR_JWS_INVALID`, `ERR_JWT_INVALID`, `ERR_JOSE_ALG_NOT_ALLOWED`,
   `ERR_JWKS_NO_MATCHING_KEY`, `ERR_JWKS_MULTIPLE_MATCHING_KEYS`. Everything
   else → `WardUnavailableError`, notably `ERR_JWKS_TIMEOUT`,
   `ERR_JWKS_INVALID`, `ERR_JOSE_GENERIC` (what jose 6.2.10 throws for a
   non-200 key-set response — "Expected 200 OK from the JSON Web Key Set HTTP
   response") and fetch `TypeError`s. Codes verified against the installed
   jose 6.2.10 (`node_modules/jose/dist/webapi/util/errors.js`).
2. Port the reference tests, adapted to this file's API: a local Ed25519
   keypair (`generateKeyPair('EdDSA')`), a JWKS served through the injectable
   `fetch`, and the `now` / `introspectionCacheTtlMs` seams the options already
   expose.

## Acceptance

- Tests prove: `alg: none` and HS256-with-the-public-key are rejected; a wrong
  `iss` or `aud` or a missing `sid` is rejected; an expired token is an
  authentication error; **a JWKS fetch failure is `WardUnavailableError`**;
  introspection is cached for 30 s and then asked again; 50 concurrent cold
  calls make one introspection request; a Ward 401 is `WardConfigurationError`
  and is not cached; a 500, bad JSON or a missing subject is unavailable;
  `readCookie` handles absent, empty-valued and multi-cookie headers.
- Backend unit green; the new spec runs under plain `npm test`.

## Out of scope

- Rejecting duplicate `ward_session` cookies, and evicting stale introspection
  cache entries — both on the watch list; decide them with Ward, since the
  reference client behaves the same way.
