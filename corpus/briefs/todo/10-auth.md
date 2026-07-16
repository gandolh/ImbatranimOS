# Task 10 — Auth: single user, sessions, TOTP option, internet-exposable

## Context

Decisions: internet-exposable from day 1; single user; sessions + strong
password; optional TOTP; rate-limited login. This gates the system apps
(11–13) — a real PTY must never ship before this lands. Depends on 08/09.

## Files you OWN

- Backend auth module (login, session issuance/validation, logout,
  password hashing — argon2/bcrypt, TOTP enrollment + verification,
  login rate limiting)
- Frontend lock screen (the OS metaphor: logging in = unlocking the
  computer; ImbatranimOS-branded once brief 14 lands, plain until then)
- First-run password setup flow (no default password EVER — entrypoint or
  first-visit wizard sets it)
- WS handshake auth (terminal/files sockets validate the session)
- `image/`/README: HTTPS story — decide built-in TLS vs documented
  reverse-proxy recipe (open question owned here); ship the chosen one

## What to do

1. Single-user credential store in the SQLite DB; argon2id hashing;
   sessions as httpOnly secure cookies; CSRF stance documented.
2. Login rate limiting + constant-time comparisons; lockout/backoff after
   repeated failures.
3. Optional TOTP (otplib or equivalent): enroll via QR in a settings
   surface, verify at login when enabled.
4. Every REST route and every WebSocket upgrade requires a valid session
   except login/first-run.
5. Resolve the HTTPS open question and record it in wiki/decisions.md.

## Acceptance

Unauthenticated requests to any API/WS get 401/refused; first run forces
password creation; TOTP can be enabled and is then required; brute-force
attempts get rate-limited/backed off; the HTTPS decision is recorded and
its recipe verified once end-to-end.
