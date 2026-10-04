---
summary: Decisions since imbatranimOS joined the Ward estate (2026-09-06) — identity, the local sign-in that comes back when Ward is absent, the ISO as a LAN server OS instead of a kiosk, and the owner's 2026-10-04 answers on briefs 15, 50, 120, 144/145/155 and old backups. Split out of decisions.md, which has a 200-line cap.
updated: 2026-10-04
---

# Decisions of the estate era

Split out of [decisions.md](decisions.md) because that page has a 200-line cap.
Same rule: changing an entry needs an explicit revisit and a `log.md` entry.

## 2026-09-06 — Identity moves to Ward (recorded 2026-10-04)

Brief 152 found this move only in `log.md` (2026-09-06), with no entry here.

- **Inside the estate, identity is Ward's.** The `imb_session` cookie, the
  argon2 check, TOTP, the first-run wizard and the login throttle were deleted.
  A global Ward guard took `AuthModule`'s place. `@Public()` and the CSRF
  Origin check survived.
- **The lock became a cover screen.** It hides the desktop, and dismissing it
  only checks the Ward session is still live. It is no longer a security claim.
- **Consequence, revisited below:** without Ward the backend would not boot,
  which broke the friend-run bar and the ISO.

## 2026-10-04 — Owner answers (asked directly after the brief runs)

- **When Ward is not configured, imbatranimOS has its own sign-in again**
  (brief 152, option C).
  - With `WARD_*` unset, a single-user local sign-in runs behind the same
    caller seam the Ward guard fills. Its pieces: a password set on first run,
    an httpOnly session cookie and a login throttle. The old code is
    recoverable from `fb3de23^`.
  - Inside the estate nothing changes: Ward still owns identity.
  - Rejected:
    - A, estate-only, which gives up the friend-run bar;
    - B, a development identity only, which does nothing for friends or the
      ISO;
    - D alone, the local Ward container, which ties a standalone install to
      another repo.
  - Cost, accepted: two sign-in paths to maintain and review.
  - The friend-run bar stands again. Brief 153 writes the docs from this.
- **The kiosk is dropped. The ISO is a server OS** (supersedes "Kiosk ISO
  deferred" in decisions.md and the kiosk half of brief 18).
  - It is a plain Alpine Linux image with the web server's packages
    pre-installed. It boots straight into serving imbatranimOS.
  - People reach it from other machines on the internal network over
    **HTTPS**. There is no local display, no Chromium and no kiosk session, so
    the `--no-sandbox` todo is moot.
  - It signs people in with the local sign-in above.
  - **It installs to disk** (owner, 2026-10-04). The ISO is an installer:
    on the console it asks which disk to use, wipes it, and installs Alpine
    plus ImbatranimOS as an ordinary system that then boots from disk.
    Rejected: running from RAM with a separate data partition, and RAM-only
    (data lost on every reboot, a demo, not a server).
  - **HTTPS from Caddy's internal CA.** Caddy issues and renews its own
    certificate. Browsers warn until its root is trusted once, and the
    console says how to get it. Rejected: a per-machine self-signed
    certificate (nothing to trust once for all devices), and bring-your-own
    (nothing works until you do).
  - **Found by its IP, shown on the console.** No mDNS. The console shows
    the address and URL at boot, and the router lists it too.
  - **Not built yet** (owner, 2026-10-04): "for now, we'll keep it only in
    docker containers for the development and we'll work with it in the
    docker container." Development and day-to-day use stay in the Docker
    container (`npm run dev`, the compose dev profile). The three choices
    above are the plan for when the ISO brief is written.
- **v1.0 (brief 15) is parked.** Its bar needs a friend's install and a real
  VPS deploy, which only the owner can do. Its desk-side parts (security pass,
  `npm audit` triage, size and boot numbers) may still run.
- **Briefs 50 (proxied web browser) and 120 (app marketplace): build them.**
  Both keep their grilled decisions and their security review before commit.
- **Old backups that still hold the deleted login's password hash are
  deleted.** Start fresh rather than scrub them.
- **Briefs 144, 145 and 155: grilled after the fact, all confirmed as built.**
  They were built without the interview their briefs asked for; asked the same
  day, the owner kept every call:
  - **144:** proactive refresh about two minutes before expiry (and on a tab
    becoming visible), plus one refresh-and-replay on a 401. Rejected:
    refresh-on-401 only, and letting the session lapse to the sign-in cover.
  - **145:** a freshness registry keyed by Ward `sid` feeds the terminal sweep
    the newest cookie. Rejected: a Terminal heartbeat route.
  - **155:** the dialog offers Overwrite, Reload from disk and Cancel (Cancel
    focused, Esc cancels). Rejected: a fourth "save as copy" button, and a
    diff view first. First cut: Notepad, Code Editor and Markdown Editor; the
    office editors follow later
    ([todo](../todos/office-editors-save-conflict.md)).
