# Task 15 — v1.0: hardening, README-as-product, friend-run QA

## Context

The finish line (decisions: friend-run bar, build-from-source
distribution, semantic v1.0). Hardening + QA across 08–14. Depends on all
prior briefs.

## Files you OWN

- `README.md` final (what it is, one-command run, VPS/HTTPS recipe,
  volume/backup story, FAQ, screenshots)
- Version stamping (package.json versions, image tag/label
  `imbatranimos:1.0`, About panel)
- Small fix commits QA surfaces (owning brief noted in commit messages)

## What to do

1. **Security pass on the exposed surface**: auth on every route/socket
   re-verified, FS jail re-tested, rate limits sane, dependency audit
   (`npm audit` triage), headers (CSP/HSTS story per the HTTPS decision).
2. **Friend-run QA**: someone who is not you, on a machine you never
   touched, follows README from clone → running desktop → login → uses
   terminal/files/notes. This is the bar itself.
3. **Cold-start + size numbers**: image size, boot-to-desktop time,
   idle RAM of the container — recorded in wiki/status.md (the
   "lightweight as identity" receipt).
4. One VPS deployment end-to-end with the documented HTTPS recipe.
5. Tag v1.0; sweep the corpus (status, open questions, log, wiki reflect
   what shipped).

## Acceptance

Friend-run bar passed by a real second human; VPS + HTTPS deployment
verified; numbers recorded; `git tag v1.0` on the commit that built it;
corpus consistent with reality.
