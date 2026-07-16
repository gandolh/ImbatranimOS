# Routing profile — ImbatranimOS

Read by the `orchestrate` skill at work-intake. Keep terse.

## Skills

- Implement skill: `plan-split-dispatch` (only for briefs with ≥3 independent
  chunks; 1–2 chunk briefs are implemented inline)
- Review skill: `code-review` (no repo-specific reviewer yet)
- PR skill: none — local-only project, commits on request, no CI

## Intent table

| Request shape | Route |
|---|---|
| "add a todo" / capture an idea | corpus-flow §1 |
| "promote / write a brief" | corpus-flow §2 |
| "work on brief NN" | corpus-flow §3 (grill → plan → implement) |
| "done / ship it" | corpus-flow §4 (move brief, log, fold into wiki) |
| "what did we decide about X" | corpus-flow §5 (wiki query — index first) |
| new research (distro tooling, themes, packages) | `web-research`, findings ingested via §6 |
| big/contentious design | `grill-me`, resolved decisions → `wiki/decisions.md` |

## READ / SKIP

| Layer | Guidance |
|---|---|
| READ | `corpus/index.md`, then ≤2–3 wiki pages by `summary:` triage |
| READ | `frontend/` + `backend/` code being changed — it is the truth |
| SKIP | `briefs/` and `todos/` wholesale — `wiki/status.md` has one line per brief |
| SKIP | `.git`, `node_modules/`, build output (`dist/`, gitignored) |

## Knowledge routing

| Question shape | Layer |
|---|---|
| why is it built this way / what did we decide | `wiki/decisions.md`, `wiki/architecture.md` |
| where do things stand | `wiki/status.md` |
| what's unresolved | `wiki/open-questions.md` |
| what does the app actually do | the code itself (code wins over wiki) |
| structural code questions (who calls X) | no code graph yet — grep; add codegraph layer once the fork lands (brief 08+) |
