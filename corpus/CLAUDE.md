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

## Conventions

- Every wiki page opens with `summary:` + `updated:` frontmatter. `index.md`
  is generated from those — never hand-maintain the catalog.
- Brief numbers are stable for the life of the file; never renumber on move.
- Briefs in `done/`/`superseded/` are immutable (outcome note added at move
  time only). New work = new brief.
- Standard relative markdown links (no `[[wikilinks]]`); absolute dates only.
- One concept per file; split pages past ~200 body lines.
- Never commit corpus changes unless the user asks.

## Source-of-truth ordering (when pages disagree)

1. The actual code/build scripts win over any wiki claim.
2. A brief in `done/` wins over `wiki/` if the wiki hasn't caught up.
3. `wiki/decisions.md` wins over `status.md` for choices not formally
   revisited. Changing a locked decision requires an explicit revisit + a
   `log.md` entry — never quietly flip one.
4. Verify any path/function the wiki names before acting on it — pages drift.

## Project invariants (load-bearing, checked when grilling briefs)

- **Lightweight is a hard constraint**: no snapd, minimal preinstall, LXQt.
- **Local-only builds**: no CI/GitHub pipeline; the ISO is built by running
  the scripted build locally (WSL2 is a flaky live-build host — use a VM or
  spare Linux box).
- **v1 is X11**; Wayland/labwc and the custom shell are v2 territory — don't
  let v2 ambitions leak into v1 briefs.
