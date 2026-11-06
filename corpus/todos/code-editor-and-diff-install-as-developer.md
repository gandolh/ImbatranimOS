---
title: Code Editor and Diff install as Developer
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Code Editor and Diff install as Developer

Code Editor and Diff leave the image as the Developer group. Monaco is 13.9 MB of the desktop's build, so this is the one move that shrinks the image noticeably, provided Monaco builds on the box under the 1 GiB cap.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); Code Editor and Diff go to a Developer group.

1. **Does text fall back to Notepad, with Code Editor's types still counted as text when Developer isn't installed?** Proposed: yes.
2. **Does Files hide Compare when Diff isn't installed?** Proposed: yes.
3. **Is the descriptor id `developer`, named "Developer", a static v2 suite on the shared kit?** Proposed: yes.
4. **If Monaco can't build under the 1 GiB cap, what then?** Proposed: the Code Editor stays built in. Committing built output would break build-from-source, and the box gets no upgrade.

## Draft brief

### Context

The Code Editor (`apps/add-ons/code-editor`, 2,060 source and 485 test lines)
carries Monaco, which is 13.9 MB of the desktop's 16.7 MB build. That makes it
the one move that shrinks the image noticeably
([research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#1-what-the-image-holds)).
The same package exports Diff (`diffManifest`). It calls `fs`, `http`,
`intents`, `notify` and `window`, and opens json ts tsx js jsx css html sh py
c cpp h hpp go rs java rb php yaml yml toml xml sql. The owner approved moving
it on 2026-11-06 ("looks good, write the briefs").

Three things depend on it today:
- **The text fallback.** `TEXT_FALLBACK_APP = 'code-editor'` in
  `apps/core/src/shared/registry/associations.ts` is where text goes when
  nothing claims it (`.csv`, `.env`, `.ini`…), and `TEXT_APP_IDS` makes
  everything Code Editor claims count as text.
- **Files' Compare.** It calls `system.intents.openApp('diff', …)`
  (`FileManager.tsx`). `openApp` on a missing id only warns in the console.
- **Monaco's build on the box.** It has never been built under the 1 GiB cap,
  and the box gets no upgrade.

Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[The rename](imbatranim-office-becomes-imbatranim-apps.md), [Games](games-install-from-imbatranim-apps.md) (layout) and
[Notepad takes over Markdown Editor](notepad-takes-over-markdown-editors-job.md) (Notepad opens markdown and stays
the text editor).

### What to do

1. **First, the build under the cap.** Build the Developer group's
   `build:os` inside a container limited like the VPS
   (`docker run --memory 1g --memory-swap 1g --cpus 1`), from a clean
   install. Record the peak memory and the time. If it runs out of memory,
   stop and report with the numbers. Don't commit built output or lift the
   cap; that is the owner's call.
2. The checklist's steps 1-4 for Code Editor and Diff. Monaco's workers must
   load from the served directory under the desktop's CSP. Office's Sheets
   formula worker shows that a kit app's worker can.
3. Questions 1 and 2, with tests: a `.json` with and without Developer, a
   `.csv` with nothing installed (Notepad), and Compare's visibility.
4. The walk (checklist step 6):
   - the before state is Code Editor as the `.ts` default, a recent file,
     and Compare used once;
   - without Developer, `.ts` and `.json` open in Notepad and Compare is
     gone;
   - with it, both come back, and Monaco's languages and highlighting work.
5. Image bytes before and after; this one should drop about 14 MB. Corpus
   (checklist step 7).

### Files you OWN

- in imbatranim-apps: the Developer group
- in this repo: `marketplace/developer.json`, `ICONS`, `associations.ts` and
  its tests, Files' Compare entry and its tests,
  `apps/add-ons/code-editor/` (deleted), its two `manifest.ts` lines,
  `package-lock.json`, the corpus pages

### Files you must NOT touch

- Notepad, apart from what question 1 needs in the association tests.
- Git GUI and REST API Client ([their own todo](git-gui-and-rest-api-client-join-developer.md)).

### Acceptance

- Step 1's numbers are in the outcome, and the build fits under the cap.
- Tests green in both repos; the walk holds; the image is about 14 MB
  smaller.
- **Owner check** after a deploy: install Developer on the VPS and open a
  `.ts` file.
