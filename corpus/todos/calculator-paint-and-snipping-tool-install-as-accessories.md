---
title: Calculator, Paint and Snipping Tool install as Accessories
created: 2026-11-06
status: open
tags: [imbatranim-apps]
---

# Calculator, Paint and Snipping Tool install as Accessories

Calculator, Paint and Snipping Tool leave the image and install as the first apps of the Accessories group. None has a backend module or a hook the catalog lacks.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.

## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); these three go to Accessories.

1. **Is the descriptor id `accessories`, named "Accessories", a static v2 suite on the shared kit?** Proposed: yes.
2. **What does Snipping Tool do without Paint?** Proposed: hide "Edit in Paint". The kit can't list apps today, so if adding that is more than a small read-only `system` call, `openApp` on a missing id shows a one-line notice instead of only warning in the console, which covers every caller.

## Draft brief

### Context

The first apps of the Accessories group from
[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md#2-every-app-and-what-moving-it-takes):

| App | Source / tests | System calls | Own dependencies |
|---|---|---|---|
| Calculator | 2,594 / 712 | none | `lucide-react` |
| Paint | 914 / 118 | `fs`, `intents`, `notify` | `lucide-react` |
| Snipping Tool | 1,396 / 161 | `fs`, `intents`, `notify`, `window` | `html-to-image`, `lucide-react` |

None has a backend module or a hook a catalog app can't declare. Snipping
Tool hands its capture to Paint
(`system.intents.openApp('paint', { dataUrl })` in
`components/AnnotationStage.tsx`). Approved by the owner on 2026-11-06
("looks good, write the briefs").

Follow the checklist in
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

### Depends on

[The rename](imbatranim-office-becomes-imbatranim-apps.md) and [Games](games-install-from-imbatranim-apps.md): the repo is imbatranim-apps, and the group
layout is settled.

### What to do

1. The checklist's steps 1-4 for the three apps, in a new Accessories group.
2. Snipping Tool: question 2. Check that `html-to-image` still captures the
   desktop from a kit app, which runs in the same page, so it should.
3. The walk (checklist step 6):
   - the before state is Calculator pinned, a Paint image saved, and Paint as
     the default for `.png` if the owner had set one;
   - after the install, a snip goes to Paint and is saved, and all three
     keep their window sizes.
4. Image bytes before and after; corpus (checklist step 7).

### Files you OWN

- in imbatranim-apps: the Accessories group
- in this repo: `marketplace/accessories.json`, `ICONS`, the three
  `apps/add-ons/` folders (deleted), their `manifest.ts` lines,
  `package-lock.json`, the corpus pages

### Files you must NOT touch

- Image Viewer and Media Player ([their own todo](image-viewer-and-media-player-join-accessories.md)), and any other add-on.

### Acceptance

- Tests green in both repos; the walk holds.
- **Owner check** after the pushes and a deploy: Start has no Calculator,
  Paint or Snipping Tool until Accessories is installed.
