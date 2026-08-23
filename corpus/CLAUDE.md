# ImbatranimOS corpus — schema & conventions

This directory is the project's **LLM-maintained wiki + work tracker**. The
human curates sources and asks questions; the LLM curates the synthesis and
tracks the work. Chat evaporates; reusable findings get folded back here.

## Layout

```
corpus/
  CLAUDE.md    this file — the rules
  index.md     content catalog (generated: bash corpus/lint.sh --index)
  routing.md   which question goes to which layer / which skill runs what
  lint.sh      health check; --index regenerates the catalog
  log.md       chronological record, newest last, absolute dates
  todos/       captured ideas as prose (pre-spec)
  briefs/      numbered, immutable work specs: todo/ done/ superseded/
  wiki/        the synthesis pages — the actual knowledge base
```

## Retrieval budget (rule, not advice)

1. Read `index.md` first; triage on `summary:` lines.
2. Open **at most 2–3 wiki pages**. Needing more means a page must split or a
   summary isn't sharp — fix the cause.
3. Never read `briefs/` or `todos/` wholesale; `wiki/status.md` has one line
   per brief. Open a brief only for the spec that directed specific work.
4. Prefer a page's `summary:` line over opening the page — that is what it is
   for.

## The corpus is the *why*, not the *what*

The corpus answers **why the code is the way it is**: decisions, intent,
history. It is the wrong tool for *what the code is* — "who calls X", "what
breaks if I change Y", "did I get every usage". Those go to `grep -rnw`, the
eslint import boundaries, or the tests; there is **no code graph in this repo
yet** (`corpus-flow` §0b can stand one up). `routing.md` has the full table.
Never answer a structural question from the wiki, and never write a grep's
output into the wiki as fact.

## Vocabulary and decisions (domain modeling)

`wiki/glossary.md` is the project's vocabulary — one canonical definition per
term, each listing the synonyms it displaces. `wiki/decisions.md` (+ the
pivot-era and iso-era pages) holds the locked calls.

- **Write terms the moment they're settled, usually mid-grill** — not in a
  batch later, when the wording that made it click is gone.
- **A term used against its glossary definition is a finding**, not a typo. Fix
  one side; a word with two live meanings is two terms and needs two names.
- **Definitions only** in the glossary — no mechanism, no spec. If an entry
  starts explaining *how*, that belongs on a concept page it links to.
- **Only project-specific terms.** "Cache" earns no entry; "desktop layer"
  does.
- **A decision is recorded only if all three hold**: hard to reverse ·
  surprising without context · a genuine trade-off with alternatives. Record
  the call, the date, the rejected alternatives, and the **reason** — a
  decision with no *why* can only be obeyed or broken, never revisited.

## Conventions

- Every wiki page opens with `summary:` + `updated:` frontmatter. `index.md`
  is generated from those — never hand-maintain the catalog.
- Brief numbers are stable for the life of the file; never renumber on move.
- Briefs in `done/`/`superseded/` are immutable (outcome note added at move
  time only). New work = new brief.
- Standard relative markdown links (no `[[wikilinks]]`); absolute dates only.
- One concept per file; split pages past ~200 body lines.
- `TodoWrite` is the in-session list; `corpus/` is the durable one. Prefer the
  corpus over personal memory for anything project-specific and reusable.
- Never commit corpus changes unless the user asks. When committing: one commit
  per meaningful corpus change, separate from the code commit, so `log.md` and
  git history agree.

## Source-of-truth ordering (when pages disagree)

1. The actual code/build scripts win over any wiki claim.
2. A brief in `done/` wins over `wiki/` if the wiki hasn't caught up.
3. `wiki/decisions.md` wins over `status.md` for choices not formally
   revisited. Changing a locked decision requires an explicit revisit + a
   `log.md` entry — never quietly flip one.
4. Verify any path/function the wiki names before acting on it — pages drift.

## Project invariants (load-bearing, checked when grilling briefs)

- **The OS is real, not simulated**: terminal = real PTY, files = real FS.
  Anything that fakes the system is off-soul.
- **The shell user is `imbatranim`, no sudo by default** — no brief may
  quietly grant root or run the container privileged.
- **Internet-exposable means auth everywhere**: no route or WebSocket
  ships without session validation; no default passwords, ever.
- **Lightweight is identity**: slim image (NestJS trade accepted, ~150MB
  target), snappy desktop, dependency additions need a reason.
- **Identity carryover is locked**: Win7-classic layout, B&W + accent —
  don't relitigate per-brief.
- **Build-from-source distribution**: clone + docker build/compose; no
  registry/CI promises without a decisions.md revisit.
