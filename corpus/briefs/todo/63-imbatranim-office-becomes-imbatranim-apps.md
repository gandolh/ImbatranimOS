# Brief 63 — imbatranim-office becomes imbatranim-apps

## Context

On 2026-11-06 the owner decided to rename imbatranim-office to
imbatranim-apps, the repo for every app that can be installed on the OS,
with Office as its first group
([research-imbatranim-apps.md](../../wiki/research-imbatranim-apps.md),
[decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md)).
Promoted from the todo `imbatranim-office-becomes-imbatranim-apps` after the
grill. This brief is only the rename; the first move is brief 64.

The repo names itself in:
- its corpus: CLAUDE.md's "Two repos, one product", the glossary,
  decisions, overview, architecture and status;
- its README and `docs/`;
- the root package name `@imbatranim-office/root`.

In this repo it is named in:
- [glossary-marketplace.md](../../wiki/glossary-marketplace.md)'s entry;
- [decisions-office-suite.md](../../wiki/decisions-office-suite.md);
- two code comments (`apps/core/src/shared/store/retiredApps.ts`,
  `apps/add-ons/file-manager/src/lib/marketplaceOpeners.ts`);
- `marketplace/imbatranim-office.json`'s `source.repo`.

vps-deploy's `scripts/rollout.ts` names it once, in a past rollout's message.

## Owner decisions (settled 2026-11-06)

1. The catalog descriptor keeps its id `imbatranim-office` and its name
   "Office". Installed rows, build directories and the server are keyed by
   that id, and app ids keep `office-`.
2. brief-board gets a new project, `imbatranim-apps`, from the new folder
   name. Every office ticket is Done.
3. The whole repo stays AGPL-3.0-only.

## Owner steps first

- Rename the GitHub repository to `imbatranim-apps`. GitHub redirects the old
  URL, so the OS's pinned commit keeps installing in between.

## What to do

1. **The office repo, words only.** Rename the repo everywhere it names
   itself:
   - the README and `docs/`;
   - `corpus/CLAUDE.md`: "Two repos, one product" becomes the apps repo,
     with groups, Office first;
   - `corpus/wiki/`, with a dated note in its decisions page: the Office calls
     hold for the Office group;
   - the root package name, to `@imbatranim-apps/root`. Refresh the lockfile
     with `npm install --package-lock-only`.

   Leave history (`log.md`, `briefs/done/`, `briefs/superseded/`), the
   `office-` ids, the `imbatranimOffice` key `vendorCss.ts` reads, and the
   app code alone. Regenerate its index and run its lint.
2. **This repo.**
   - The glossary entry becomes imbatranim-apps (Office and later groups),
     with "imbatranim-office" under _Avoid_ as the old name.
   - Add a dated note to decisions-office-suite.md, and fix the two code
     comments.
   - Change `marketplace/imbatranim-office.json`'s `source.repo` to
     `https://github.com/<owner>/imbatranim-apps` (the same owner) only if
     `git ls-remote` answers; otherwise leave it and say so.
   - Leave the descriptor's id and file name, history, and vps-deploy's
     message.
3. **The local checkout.** Rename its folder to `imbatranim-apps`, beside this
   one. Once the GitHub rename is done, point `origin` at the new URL. Don't
   push.
4. **Checks.** Office's `npm run build:os`, tests and lint, and this repo's
   catalog tests (`catalog.spec.ts`), are unchanged.
5. **Corpus** in both repos: status, log. brief-board picks up the new project
   name at the next sync the owner asks for.

## Files you OWN

- the office repo's README, `docs/`, `corpus/` (not history), `package.json`
  name, `package-lock.json`
- this repo's `glossary-marketplace.md`, `decisions-office-suite.md`, the two
  comments, `marketplace/imbatranim-office.json` (`source.repo` only),
  `corpus/log.md`, `corpus/wiki/status.md`

## Files you must NOT touch

- Any app id, the descriptor id or file name, app code, vps-deploy.

## Acceptance

- `grep -rn "imbatranim-office"` in both repos finds only:
  - the descriptor's id and file name;
  - history;
  - the _Avoid_ line and the notes that explain the rename.
- Both corpora lint clean; Office builds, tests and lints as before.
- **Owner check:** after the GitHub rename and a push of both repos, Settings
  → Marketplace on the VPS still installs and opens Office.
