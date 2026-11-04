# Brief 44 — Linux apps on the VPS, inside a capped container

## Context

The plan was to turn Linux apps on for the VPS once the first wave's numbers
were in. They are: one Firefox window took 506-593 MB PSS (brief 04). On
2026-11-04 the box had 3.7 GiB RAM, 2.1 GiB available, 2 vCPUs and 763 MB of
its 2 GiB swap in use, shared with Ward, mail, monitoring and the other apps.

The owner chose on 2026-11-04 to turn them **on**, with **the whole
imbatranimOS container capped** for CPU and memory so it can't take the other
services' share. No limit on sessions or apps inside the OS was asked for.
The cap itself goes in vps-deploy's `imbatranim-os` stack (a separate brief
there); this brief measures, makes the OS behave well under the cap, and
documents the numbers.

## Spec

1. Measure the production image with Linux apps: the container at rest, with
   one Firefox window idle, and with one playing a video (memory and CPU). A
   short run, not a benchmark.
2. Propose `mem_limit` and `cpus` from those numbers, leaving the box at least
   the headroom it has today for the other stacks. Write them in
   `infrastructure/README.md` (or the deploy doc it links) for vps-deploy.
3. Under the memory cap, the kernel must kill a Linux app before the backend:
   Linux app processes get a higher `oom_score_adj` than the backend.
4. A Linux app killed for memory closes its windows and leaves one OS
   notification saying it was stopped because the machine ran out of memory.
   The desktop stays.

## Must preserve

- Everything that works locally today, with no cap.
- No root: `oom_score_adj` raises are allowed to an unprivileged user.

## Acceptance

- With the proposed cap set in local Compose, Firefox runs and plays video;
  forcing memory past the cap kills Firefox, not the backend, and the
  notification shows.
- The numbers and the proposed cap are in the docs, ready for vps-deploy.

## Files you OWN

- `apps/backend/src/modules/linux-apps/` (`oom_score_adj`, the stopped notice)
- `infrastructure/README.md` / the deploy doc

Deploying it on the VPS stays the owner's step, after vps-deploy's stack
carries the cap.
