---
title: Git GUI and REST API Client join Developer
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Git GUI and REST API Client join Developer

Git GUI and REST API Client join Developer. Each leans on an OS-side module that does system work (running git, the SSRF-guarded outbound proxy), which stays in the OS.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); the two go to Developer.

1. **Do the `git` and `http-proxy` modules stay in the OS as its own capabilities, with only the apps moving?** Proposed: yes (Claude's default of 2026-11-06). A catalog app with `http` could already reach any OS route, the SSRF guard stays where it was reviewed, and git stays in the image for the installer. The alternative: a server in the Developer group, which costs a cold start and about 100 MB while open and takes the SSRF guard out of the OS.

## Draft brief

### Context

Two developer tools that
[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes)
found blocked because each leans on an OS-side module that does system work:

| App | Source / tests | Backend module | System calls |
|---|---|---|---|
| Git GUI | 1,947 / 326 | `git` (2,768: runs git on repos in the home folder, recents) | `http`, `intents`, `notify` |
| REST API Client | 2,946 / 1,115 | `http-proxy` (783: outbound requests behind the SSRF guard) | `fs`, `http`, `intents`, `notify` |

Neither has a hook a catalog app can't declare, so once the modules stay
(question 1) they move like any client-only app. The owner approved moving
them on 2026-11-06 ("looks good, write the briefs").

Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[Code Editor and Diff](code-editor-and-diff-install-as-developer.md) (the Developer group).

### What to do

1. The checklist's steps 1-4 for both apps, added to `developer.json` with a
   new pin.
2. Check whether anything outside the two apps opens them (Files, the Code
   Editor, the palette). If so, apply checklist step 5.
3. The walk (checklist step 6):
   - the before state is a repo in the home folder with a staged change, a
     saved REST request with an environment variable, and Git GUI's recents;
   - after removing them, nothing breaks;
   - after installing Developer, commit and send the request, and check that
     the recents, the saved request and the environment came back;
   - after uninstalling and reinstalling, they are still there.
4. Corpus (checklist step 7).

### Files you OWN

- in imbatranim-apps: the two apps in the Developer group
- in this repo: `marketplace/developer.json`, `ICONS`, the two
  `apps/add-ons/` folders (deleted), their `manifest.ts` lines,
  `package-lock.json`, the corpus pages

### Files you must NOT touch

- `apps/backend/src/modules/git/` and `http-proxy/`, per question 1.

### Acceptance

- Tests green in both repos; the walk holds.
