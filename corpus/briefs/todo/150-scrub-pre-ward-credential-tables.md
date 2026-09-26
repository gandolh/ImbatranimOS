# Brief 150 — Scrub the pre-Ward credential tables

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · BACKEND
(`apps/backend/src/db/db.service.ts`, one new ledger step + spec).
Independent; land it before brief 154, which edits the same file. Implement
inline.

## Context

`db.service.ts` still creates `auth_user` (`password_hash`, `totp_secret`,
`totp_enabled`, `totp_last_step`) and `auth_sessions` in the baseline step
(`:359-376`), and ledger step 5, `totp-last-step`, alters `auth_user`
(`:147`, `:493`). Since the cutover, nothing in `apps/backend/src` or `test/`
reads or writes either table.

On a fresh install they are empty. On **every install that ran before
2026-09-06** they still hold the owner's argon2id password hash and TOTP
secret, and every backup — a `VACUUM INTO` of the whole database — carries them
off the machine in each downloaded `.tar.gz`. The restore code justifies no
longer revoking sessions with "Credentials are Ward's now and are not in this
database" (`backup.service.ts`, `installDatabase`); on an upgraded install that
sentence is false. The realistic cost is an offline-crackable hash of a password
the owner may well reuse at Ward.

The comment at `db.service.ts:329` also still cites the deleted
`SessionAuthGuard`; fix it while here.

## Files you OWN

- `apps/backend/src/db/db.service.ts` — a new ledger step, and the stale
  comment
- `apps/backend/src/db/db.service.spec.ts`

## Files you must NOT touch

- Ledger steps 1–6 — the ledger replays history, and rewriting old steps would
  make migrated and fresh databases diverge (brief 110).

## What to do

Add ledger step 7, `drop-pre-ward-auth`:
`DROP TABLE IF EXISTS auth_sessions; DROP TABLE IF EXISTS auth_user;` — with
no catch (brief 110: steps added after the ledger get none). A restored old
backup is migrated by `replaceWith`, so it is scrubbed too.

## Acceptance

- Specs: a pre-ledger database with populated `auth_user` and `auth_sessions`
  migrates to version 7 with neither table present; a fresh database ends
  without them too; a `VACUUM INTO` snapshot taken after migration contains
  neither.
- Backend unit + e2e green.

## Out of scope

- Backups downloaded before this lands are the user's files. Mention them in
  the log entry, so the owner knows older archives still carry the hash.
