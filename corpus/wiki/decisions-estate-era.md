---
summary: Decisions since imbatranimOS joined the Ward estate (2026-09-06) — identity, the local sign-in that comes back when Ward is absent, the ISO as a LAN server OS instead of a kiosk (deferred; work stays in Docker), the owner's 2026-10-04 answers on briefs 15, 50, 120, 144/145/155 and old backups, brief 50's build calls (proxy on its own origin, the strict egress stance, the encrypted profile). Brief 120's marketplace calls are in decisions-marketplace.md.
updated: 2026-10-06
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
    office editors followed in brief 156 (Sheets and Docs; Slides never
    writes the deck)
    ([todo](../todos/office-editors-save-conflict.md)).

## Brief 50: the Browser (2026-10-04)

Built from the 2026-07-19 grill. The calls the build had to add or change:

- **Proxied pages run on their own origin: a second backend port**
  (`BROWSER_PROXY_PORT`; compose uses 8081 for prod and 3002 for dev). The brief
  had Scramjet's service worker on the desktop's origin under a `/proxy/`
  scope. But Scramjet runs every proxied page on the origin that serves it, so
  one rewriter escape there would hold the session cookie and could open the
  terminal over the same-origin WebSocket. A path scope does not separate
  origins.
  - On a separate origin the desktop's guards hold: its Origin check refuses the
    proxy origin's mutating requests, CORS hides responses, and the terminal's
    upgrade checks Origin.
  - Cost: one more port to publish, and behind a TLS proxy its own site
    (`BROWSER_PROXY_ORIGIN`).
  - Rejected: same origin with a path-scoped service worker (above); a
    subdomain (needs DNS that a localhost or LAN install does not have).
- **The add-on frames the proxy origin itself; core gains nothing.** Since
  brief 48, core's barrel is type-only, so the brief's `<ProxyView>` export
  from core no longer fits the seam. On a separate origin the service worker
  is not core's either. Lazy loading comes for free: nothing proxy-related
  exists until the Browser window mounts its frame, and the desktop origin
  never registers a worker.
- **Egress, the stricter stance (opposite to brief 43's, on purpose).** The
  REST client may reach the LAN because it sends only URLs the owner typed.
  The relay carries traffic for pages whose own scripts drive it.
  - Allowed: public unicast addresses only (ipaddr.js range `unicast`, minus
    the IPv4-compatible `::/96`), on ports 80, 443, 8080 and 8443.
  - The check runs on every DNS answer, and the socket dials the checked
    address with no second lookup, so DNS rebinding has no window.
  - It is our socket class handed to wisp-js. wisp-js's own filter is not
    relied on: it checks one answer, lets `::ffff:127.0.0.1` through, and
    re-resolves before connecting.
  - UDP is off.
- **Profile key: a random per-machine file, not derived from an account
  secret.** In the estate there is no password to derive from, and the local
  sign-in's can change.
  - The jar is AES-256-GCM encrypted in `browser_profile` (ledger step 9).
  - The key is `.imbatranim/browser-profile.key` (0600). Backups exclude it,
    so a backup carries only ciphertext. A lost key reads as an empty profile:
    the Browser is signed out of every site, nothing worse.
- **The jar never rests in the viewing browser.** Scramjet writes it to
  IndexedDB in plaintext on one path and fails to read it back after a worker
  restart. Our worker intercepts that path. It pushes every change to the
  desktop, which saves it encrypted. After a restart the worker asks the host
  page for the jar before it answers proxied requests.
- **Scramjet 1.1.0 (MIT now, no longer AGPL), wisp-js 0.5.0 (LGPL), bare-mux
  2.1.9 and epoxy-transport 2.1.28 (AGPL) are pinned exactly.** Not
  epoxy-transport 3.x: it targets the newer proxy-transports interface, and
  under bare-mux 2 every request failed with "headers is not iterable". `sw.js` relies
  on Scramjet's cookie-store and message internals, which a minor version may
  change.
  - About 2.4 MB of browser assets ship in the image, served from the
    packages' prebuilt `dist/` (no Rust toolchain).
  - This is the first accepted heavyweight subsystem. The cost is disk only:
    nothing runs or loads until the Browser opens.
- **The host page's CSP allows `'unsafe-eval'`.** Scramjet's controller
  compiles code from strings and refused to start without it. That costs
  little on an origin where every proxied site's own scripts run by design.
  The policy is there for `frame-ancestors`: only the desktop may frame it.
- **Bookmarks opens links in the Browser when it is set up,** and in a tab
  otherwise. The command palette still opens a tab: its `activate` has no
  `system` handle.

Brief 120's calls (the marketplace) are on their own page:
[decisions-marketplace.md](decisions-marketplace.md).
