# Brief 153 — The docs and the corpus tell the truth about identity

Status: **todo** · From the 2026-09-26 improvements sweep. MEDIUM (prose) ·
`README.md`, `infrastructure/` docs, `corpus/`. **After brief 152** — the run
story depends on its outcome — and after 137 and 144, so the sign-in
description matches shipped behaviour. Implement inline.

## Context

Everything public, and every page an agent reads first, still describes the
deleted local authentication:

- `README.md` — "First login" (a setup wizard, "Pick a password (10 characters
  minimum)"), TOTP under Settings → Security, the FAQ ("argon2id-hashed
  password, sessions in an httpOnly/SameSite=Lax cookie, per-IP rate limiting
  with exponential backoff on login, optional TOTP"; "How do I reset my
  password if I forget it?"), and "Data & backup" ("you are signed out
  afterwards, because the backup brings its own password with it").
- `infrastructure/README.md` — "First visit forces a password", the
  `COOKIE_SECURE` / `SESSION_TTL_HOURS` table (neither variable exists; only
  `TRUST_PROXY` does), "Auth model (what ships)", and the argon2 native-module
  note. `infrastructure/Caddyfile.example` step 4 (`COOKIE_SECURE`, "login
  rate-limiting"). `infrastructure/docker-compose.yml`'s commented
  `environment:` block, and its `TRUST_PROXY` note about login rate-limiting.
- The corpus: `wiki/architecture.md:25,41-43` (the `auth` module, argon2id,
  `imb_session`), which `apps/docs/scripts/sync-corpus.mjs` publishes verbatim
  to the public docs site; `wiki/glossary.md:176-178`, which defines *auth
  session* as the deleted `imb_session` cookie and has no entry for *Ward
  session*, *grant* or the settled rename *Cover screen*; `wiki/status.md`,
  which certifies the deleted authentication as "verified for real";
  `corpus/todos/csp-connect-src-ws-wildcard.md`, which describes a CSP the code
  already fixed (`security-headers.ts`: `connect-src 'self'`); and
  `corpus/todos/totp-recovery-codes.md`, which specs work that is now Ward's.

## Files you OWN

`README.md`, `infrastructure/README.md`, `infrastructure/Caddyfile.example`,
the comments in `infrastructure/docker-compose.yml`,
`corpus/wiki/{architecture,glossary,status,open-questions}.md`,
`corpus/todos/{csp-connect-src-ws-wildcard,totp-recovery-codes}.md`, and one
`corpus/log.md` entry.

## Files you must NOT touch

- Any code.
- `apps/docs/src/content/docs/wiki/*` — generated; rebuild instead of editing.

## What to do

1. Rewrite the identity sections from what the code does after briefs 137, 144
   and 152: sign-in at Ward, the `imbatranim-os` grant, the cover screen, what
   a backup contains (brief 149's wording), and how to run it (brief 152's
   decision).
2. Glossary: add *Ward session*, *grant* and *Cover screen*; re-point or retire
   *auth session*, and keep the "terms that split" note honest.
3. Close or rewrite the two stale todos with an outcome line. If the owner
   wants it tracked here, add an `open-questions.md` entry for the
   shared-origin exposure (see the 2026-09-26 sweep's watch list: any script
   running on a sibling estate app is same-origin with this one).
4. `bash corpus/lint.sh --index`, then `npm run docs` to regenerate the site.

## Acceptance

- `grep -rn "argon2\|imb_session\|COOKIE_SECURE\|SESSION_TTL\|setup wizard\|first-run wizard\|TOTP" README.md infrastructure corpus/wiki`
  returns only historical or decision context, never a description of current
  behaviour.
- `bash corpus/lint.sh` passes, and the docs build succeeds.

## Outcome (2026-10-04)

Written from brief 152's outcome (option C).

- **`README.md`:**
  - "First visit" replaces "First login": Set up this machine,
    `SETUP_TOKEN`, the cover screen, Log off.
  - "Inside a Ward estate" covers all three `WARD_*` or none.
  - Settings mentions the password change, and the HTTPS recipe needs only
    `TRUST_PROXY`.
  - The kiosk ISO section became the planned server ISO.
  - Data & backup says a restore signs you out in local mode.
  - The FAQ is rewritten: scrypt, cookie hash, backoff, setup token, no
    local two-factor. The password reset now clears `local_owner` with
    `sqlite3` instead of deleting the database.
- **`infrastructure/README.md`:**
  - The `COOKIE_SECURE`/`SESSION_TTL_HOURS` table is replaced by
    `TRUST_PROXY` and `SETUP_TOKEN`.
  - "Identity (what ships)" describes both modes and what is common to them.
  - The argon2 note is gone.
  - Also updated: `Caddyfile.example` step 4 and the compose comments.
- **Corpus:**
  - architecture's identity row and module bullet;
  - the glossary's *Ward session* / *local session*, *grant* and *Cover
    screen*;
  - `status.md` split: the narrative to 2026-08-06 moved unchanged to
    `status-history.md`, and status is a current snapshot again with the
    brief table kept;
  - both stale todos closed with an outcome line;
  - an `open-questions.md` entry for same-origin exposure inside the estate;
  - two dated research pages annotated.
- **Acceptance grep:** what's left is history (status-history, the brief
  table's row for brief 10, dated research pages, the decisions pages) or the
  line saying `COOKIE_SECURE` no longer exists. `imb_session` describes
  current behaviour again, in local mode.
