---
summary: Web-OS era unknowns — app-install story without sudo, HTTPS in-app vs proxy, accent pick, image size reality, registry publishing, fork prune surprises.
updated: 2026-07-16
---

# Open questions

- **How does "installing apps" work with no sudo?** `apk add` needs root.
  Options: a root-owned backend helper with an allowlist, a fatter base
  image with tools preinstalled, or "the app store is the web apps only,
  the Linux side is what it is." Decide when the terminal/files apps are
  real (affects brief 13's scope).
- **HTTPS: built into the Nest server or reverse-proxy-only?** "Proper
  auth" is decided; whether the container terminates TLS itself
  (self-signed? ACME?) or ships a documented Caddy/Traefik recipe is not.
  Owned by the auth brief (10).
- **Accent color(s) on the B&W identity** — carried over; decided from
  rendered mockups inside the reskin brief (14).
- **Backend-language revisit (ANSWERED + open decision).** Brief 09
  measured the prod image at **364 MB** — over the ~150 MB target and the
  200 MB tripwire, so per the decision this reopens NestJS-vs-Go. Realistic
  Node+Nest floor is ~300 MB; the target was optimistic. Options: (a) amend
  the target, keep NestJS (the reuse it bought — terminal/files/system/apps
  seeds — is the whole reason it was chosen); (b) squeeze harder (distroless
  base, drop node-pty's extra prebuilds, trim class-validator's
  libphonenumber) for maybe ~280 MB, same order of magnitude; (c) rewrite
  the backend in Go for a ~20–40 MB image, discarding the fork reuse.
  Awaiting a user call — a locked-decision change needs sign-off + a log
  entry.
- **Registry publishing** (Docker Hub/GHCR) vs build-from-source-only —
  deferred until v1 works; build-from-source is the standing decision.
- **Does the config-based `repl` module survive alongside a real terminal?**
  Brief 08 found the fork's terminal is an HTTP command-runner, not a live
  PTY. Brief 11 builds the real WS terminal; decide there whether the old
  repl module is absorbed or kept as a separate "saved commands" feature.
- **Files app vs existing file-manager + notes modules.** The fork already
  has a `file-manager` frontend and `files` + `notes` backend modules.
  Brief 12 must reconcile (extend, don't duplicate) rather than build fresh.

Resolved 2026-07-16 (brief 08): fork prune was clean — docker-desktop and
service-launcher were not entangled with shared window/file services;
removing them + the docker/services backend modules + dockerode left both
apps building green.
