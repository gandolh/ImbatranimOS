---
title: npm run dev also starts the prod service
created: 2026-11-03
status: open
tags: [infra, dev]
---

# `npm run dev` also starts the prod service

Found while building brief 22 (2026-11-03). `docker compose --profile dev
watch`, with no service named, brings up every active service: `dev`, and
`imbatranimos`, which has no profile. On a machine without the prod image,
the first `npm run dev` builds it too (Nix, the native addons, the desktop's
production build); after that it starts a prod container on 8080 beside the
dev one, with its own home and Nix volumes. Seen in a miniature of the
compose file, where a profile-less service started under `watch`.

Probably never meant. The fix is one argument: `scripts/dev.mjs` passes
`dev` to `watch` (or the prod service takes a profile of its own, which would
change the README's `up imbatranimos`). The owner's call, since someone may
lean on having both up.
