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
- **Does the image actually land near 100–150MB with NestJS?** Measured in
  the image brief (09); if it balloons past ~200MB the Go-backend decision
  gets a formal revisit.
- **Registry publishing** (Docker Hub/GHCR) vs build-from-source-only —
  deferred until v1 works; build-from-source is the standing decision.
- **What breaks in the fork prune?** minimal-web-desktop's docker-desktop
  and service-launcher apps get cut; unknown how entangled they are with
  the shared window/file services. Surfaces in brief 08.
