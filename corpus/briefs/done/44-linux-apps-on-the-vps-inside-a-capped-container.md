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

## Outcome (2026-11-05)

Done in `2c41b55` (1.149.0) and `2ecb1cb` (1.150.0); numbers and the cap in
`infrastructure/README.md` ("Linux apps on the VPS: the container cap").

1. **Measured** in a local production image (one session, cgroup v2,
   a laptop core): at rest 67 MiB anon (388 MiB `memory.current` with
   cache), one Firefox idle 590 MiB anon (1.16 GiB), Firefox playing a 480p
   WebM 619 MiB anon and about 42% of a core; under the cap 621 MiB current
   (489 anon, 100 file) and 45% of the cap, with no memory pressure events.
2. **Proposed cap:** `mem_limit: 1g`, `memswap_limit: 1g`, `cpus: 1.0`.
   Keeping all of today's 2.1 GiB of headroom isn't possible with a
   Firefox running at all; at 1 GiB the other stacks keep about 1.4 GiB at
   worst, and one vCPU of two.
3. **Linux apps go first.** Apps launched from Start and Terminal shells
   get `oom_score_adj` 1000 (`linux-apps/oom.ts`); the backend, the
   Wayland host and the session buses stay at 0. Found while measuring:
   Firefox sets its own main process back to 0 while it starts (an
   unprivileged process may lower its score to where it began), which tied
   it with the backend and left its content processes (Firefox's own 133,
   200) as the likely victims. The backend raises a launched app's main
   process again at 5 s and 30 s; raised after start-up it stays.
4. **The notice.** A Start-launched app killed with SIGKILL while the
   container's `memory.events` counts a new `oom_kill` sends `app_stopped`
   to its tab, which shows one warning: "Firefox was stopped. The machine
   ran out of memory. Your other apps and the desktop are still running."

**Checked:**
- Tests: the score write, the `memory.events` parsing and "a kill since
  the last look" (5); the tab's warning (1). Backend and core typecheck,
  lint and the suites of the modules touched.
- **Capped run** (a separate Compose project with the production image,
  its own home volume and the dev Nix volume, 1 GiB / 1 CPU): Firefox ran
  and played the video; its main process at 1000 after 35 s, the backend
  at 0. A page allocating 64 MiB blocks pushed past the cap: `oom_kill` 2,
  Firefox gone and its windows closed, the warning in the tab, the backend
  answering `/health`, no container restart.
- Not measured: the VPS itself (its vCPU is likely slower than the laptop
  core) and a Linux app started from a Terminal being killed (it gets the
  score, but no notice: the backend doesn't know its name).

**Owner step:** vps-deploy's `imbatranim-os` stack sets the cap (no brief
for it there yet), then the deploy that turns Linux apps on.
