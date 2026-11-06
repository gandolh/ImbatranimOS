---
title: imbatranim-office becomes imbatranim-apps
created: 2026-11-06
status: promoted
tags: [imbatranim-apps]
---

# imbatranim-office becomes imbatranim-apps

Rename imbatranim-office to imbatranim-apps, the repo for every app that can be installed on the OS, with Office as its first group. Words, one URL and the local folder; no app code.

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.


> PROMOTED 2026-11-06 to [brief 63](../briefs/todo/63-imbatranim-office-becomes-imbatranim-apps.md), after the grill. The brief is the spec; this todo keeps the questions as asked.
## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); the repo becomes imbatranim-apps.

1. **Does the catalog descriptor keep the id `imbatranim-office` and the name "Office"?** Answered 2026-11-06: yes.
2. **Does the board get a new project, `imbatranim-apps`, or keep `imbatranim-office` through `corpus/board-name`?** Answered 2026-11-06: a new project, `imbatranim-apps`.
3. **Does the whole repo stay AGPL-3.0-only?** Answered 2026-11-06: yes.

## Draft brief

### Context

On 2026-11-06 the owner asked to rename imbatranim-office to imbatranim-apps
and make it the repo for every app that can be installed on the OS, with the
office suite as one group among several.
[research-imbatranim-apps.md](../wiki/research-imbatranim-apps.md) has the
app list, and
[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#3-the-rename)
has what the rename touches. This brief is only the rename. The first apps
to move are in [Games](games-install-from-imbatranim-apps.md).

Today the repo is named in the office corpus (CLAUDE.md's "Two repos, one
product", the glossary, decisions, README), in this repo's
[glossary-marketplace.md](../wiki/glossary-marketplace.md) entry and
[decisions-office-suite.md](../wiki/decisions-office-suite.md), in two code
comments (`apps/core/src/shared/store/retiredApps.ts`,
`apps/add-ons/file-manager/src/lib/marketplaceOpeners.ts`), in the office
root package name `@imbatranim-office/root`, and in
`marketplace/imbatranim-office.json`'s `source.repo`.

### Owner steps first

- Rename the GitHub repository to `imbatranim-apps`. GitHub redirects the old
  URL, so the OS's pinned commit keeps installing in between.

### What to do

1. **The office repo, words only.** Rename the repo everywhere it names
   itself:
   - its README and `docs/`;
   - `corpus/CLAUDE.md`: "Two repos, one product" becomes the apps repo,
     with Office as its first group;
   - `corpus/wiki/` (glossary, decisions, overview, architecture, status),
     with a dated note in its decisions page: the Office calls still hold
     for the Office group;
   - the root package name, to `@imbatranim-apps/root`. Refresh the lockfile
     with `npm install --package-lock-only`.

   Leave `log.md`, `briefs/done/`, the `office-` ids, the `imbatranimOffice`
   key in package.json that `vendorCss.ts` reads, and the app code alone.
   Regenerate its index and run its lint.
2. **This repo, words and one URL.**
   - Update the glossary-marketplace entry: imbatranim-apps, which holds Office
     and later groups, with "imbatranim-office" under _Avoid_ as the old name.
   - Add a dated note to decisions-office-suite.md.
   - Fix the two code comments.
   - Change `marketplace/imbatranim-office.json`'s `source.repo` to
     `https://github.com/<owner>/imbatranim-apps` (the same owner as today)
     only if `git ls-remote` answers for it; otherwise leave it and say so
     in the outcome.
   - Leave the descriptor's file name and id (question 1), `log.md`,
     `briefs/done/`, and vps-deploy's `rollout.ts` message, which records a
     past rollout.
3. **The local checkout.** Rename its folder to `imbatranim-apps`, beside this
   one. Once the GitHub rename is done, point its `origin` at the new URL.
   Don't push.
4. **Checks.** Office's `npm run build:os`, its tests and lint, and this
   repo's tests that read the catalog (`catalog.spec.ts`) are unchanged.
5. **Corpus.** status.md, log.md and the research page's brief list in both
   repos as they apply.

### Files you OWN

- the office repo's README, `docs/`, `corpus/` (not `log.md` history or
  `briefs/done/`), `package.json` name and `package-lock.json`
- this repo's `corpus/wiki/glossary-marketplace.md`,
  `corpus/wiki/decisions-office-suite.md`, the two comments,
  `marketplace/imbatranim-office.json` (`source.repo` only), `corpus/log.md`,
  `corpus/wiki/status.md`

### Files you must NOT touch

- Any app id, the descriptor id, or the descriptor's file name.
- App code in either repo.
- vps-deploy.

### Acceptance

- `grep -rn "imbatranim-office"` in both repos finds only the descriptor's
  id and file name, history (`log.md`, `briefs/done/`, dated notes), the
  _Avoid_ line, and the old name where a note explains the rename.
- Both corpora lint clean; Office builds, tests and lints as before.
- **Owner check:** after the GitHub rename and a push of both repos,
  Settings → Marketplace on the VPS still installs and opens Office.
