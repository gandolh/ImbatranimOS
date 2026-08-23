# Routing — how work routes in this project
<!-- Read by the orchestrate skill at work-intake. Tune freely; keep it short. -->

**Implement skill:** `plan-split-dispatch` — only for briefs with ≥3 independent
chunks; 1–2 chunk briefs are implemented inline (the dispatch tax isn't worth it)
**Review skill:** `code-review` for correctness; `thermo-nuclear-review` for a
strict maintainability pass on a diff — deliberate, not routine
**PR skill:** none — local-only project, no CI, no PR flow. Commit policy (user,
2026-07-17): commit periodically during runs — one commit per completed brief on
`main`, plus a separate commit for the corpus change. Never push without an
explicit go
**Issue tracker:** none — `corpus/briefs/` **is** the tracker; `wiki/status.md`
holds one line per brief
**Code host:** GitHub (`gandolh/ImbatranimOS`), origin only — no `gh` workflow

## Intent routing

| Signal | Intent | Route to |
|---|---|---|
| New idea/task to capture | capture | `corpus-flow` §1 — add a todo |
| Ready to build, ≥3 independent chunks | build (dispatched) | brief (§2) → `plan-split-dispatch` |
| Ready to build, 1–2 files / one indivisible piece | build (inline) | brief (§2) → implement inline |
| "work on brief NN" | build | `corpus-flow` §3 — grill → plan → implement |
| "done / ship it" | closeout | `corpus-flow` §4 — move brief, log, fold into wiki |
| "what should we work on" / find the debt / audit the repo | audit | `improve` — **gated**: returns a ranked list, the user picks what gets promoted |
| Research distro tooling, packages, prior art | research | **inline** web search in the main thread — **gated**, propose options and stop; findings ingested via §6 |
| Big or contentious design | design (grill) | `grill-me` → decisions to [wiki/decisions.md](wiki/decisions.md), terms to [wiki/glossary.md](wiki/glossary.md) |
| New app / UI surface / visual polish | design | `impeccable` — **but see the identity lock below** |
| "is this accessible" / UI compliance on source | design (check) | `web-design-guidelines`, then [wiki/ui-conventions.md](wiki/ui-conventions.md) — the house rules win |
| Browser walk-through of a UI change | test | `ui-test-plans` → `corpus/test-plans/` (none authored yet) |
| README / docs-site prose needs a pass | docs | `writing-guidelines`; `unslop` first if the text was AI-drafted |
| A diagram would beat prose | docs | `diagram-design` |
| Docs site (`apps/docs`) work | docs | `corpus-docs-site` — the site already exists; sync list is `apps/docs/scripts/sync-corpus.mjs` |
| "what do we call this" / define a term / record a locked decision | domain | `corpus-flow` §9 — [glossary.md](wiki/glossary.md) + [decisions.md](wiki/decisions.md) |
| "what does the wiki say about X" | query | `corpus-flow` §5 — index first, ≤3 pages |
| VPS / reverse-proxy deploy of the docs site or the OS | deploy | `bootstrap-vps-deploy` |

**The identity lock overrides the design skills.** Win7-classic layout, B&W
tokens + one accent, dark-first, zero border radius — locked in
[decisions-iso-era.md](wiki/decisions-iso-era.md), enforced by
[ui-conventions.md](wiki/ui-conventions.md). `impeccable`, the taste presets
(`minimalist-ui`, `industrial-brutalist-ui`, `high-end-visual-design`) and
`design-md-library` may be used **inside** that identity, never to propose a new
one. A design pass that suggests rounding corners, a second accent or a gradient
has misread the project. `apps/docs` (the public Starlight site) is the one
surface with its own look — light-only, no toggle — and is not bound by the
desktop's token rules.

## Knowledge routing — which layer answers which question
<!-- The corpus is the WHY; the code is the WHAT. Neither substitutes. -->

| Question shape | Route to |
|---|---|
| "Why is it built this way?" / "what did we decide?" | [wiki/decisions.md](wiki/decisions.md) (+ pivot-era / iso-era), [wiki/architecture.md](wiki/architecture.md) |
| "What do we call this?" / a term is being used two ways | [wiki/glossary.md](wiki/glossary.md) |
| "Where do things stand?" | [wiki/status.md](wiki/status.md) — one line per brief |
| "What's still unresolved?" | [wiki/open-questions.md](wiki/open-questions.md) |
| "How does an app talk to the OS?" | [wiki/os-layering.md](wiki/os-layering.md), then `packages/ui/src/system.ts` — the interface **is** the spec |
| "How should this UI look/behave?" | [wiki/ui-conventions.md](wiki/ui-conventions.md) — 40+ numbered rules with code citations |
| "Blast radius of X?" / "who calls this imported function?" | the **code graph** — `codegraph impact <sym>` / `callers <sym> --limit N`. 100% caller recall on imported functions, correct across the `@imbatranim/ui` barrel |
| Anything reached through the `system` handle (`system.notify`, `system.fs.*`) | **`grep -rn "system\.notify("`** — the graph resolves ~35% of member calls. See [wiki/code-graph.md](wiki/code-graph.md) |
| `manifest`, `APP_NAME`, `formatBytes` — any name 2+ add-ons export | **`grep` scoped by path** — the graph conflates duplicate names (26 of them) |
| **"Did I get _every_ usage?"** (rename/refactor/delete) | **`grep -rnw`** — nothing else is complete; the graph scopes, grep proves |
| "Does this break the seam?" | `npm run lint` — the add-on import boundary is eslint-enforced, not tribal |
| "Does this still work?" | `npm test` (backend Jest) · `npm run typecheck` · `npm run build` |
| "What does the app actually do?" | the code — it wins over every wiki claim |

**Code graph: live since 2026-08-23** (`corpus-flow` §0b). `@colbymchenry/codegraph@1.5.0`
pinned, `.mcp.json` committed, index gitignored, rebuilt by `npm run codegraph:init`
(~3s) and refreshed by `npm run codegraph:sync`. The measured accuracy envelope is
[wiki/code-graph.md](wiki/code-graph.md); the operating rules are the project skill
[.claude/skills/codegraph/SKILL.md](../.claude/skills/codegraph/SKILL.md). **Lead
with the graph to locate and scope; verify with grep before acting on
completeness** — and never ask it about `system.*` calls or a duplicated export
name.

## READ / SKIP / SKILLS

| Task type | READ | SKIP | SKILLS |
|---|---|---|---|
| add-on feature | the brief · [ui-conventions.md](wiki/ui-conventions.md) · [glossary.md](wiki/glossary.md) · the target `apps/add-ons/<app>/` · `packages/ui/src/system.ts` | other add-ons · `apps/backend/` unless a new route is needed · `iso/` | `corpus-flow`, `ui-test-plans` if user-visible |
| core / shell change | the brief · [os-layering.md](wiki/os-layering.md) · `apps/core/src/` (`contract.ts`, `manifest.ts`, `shared/`) · `packages/ui/src/system.ts` | `apps/add-ons/*` internals · `iso/` · `apps/docs/` | `corpus-flow` |
| backend / API | the brief · `apps/backend/src/modules/<module>/` · `auth/` guards + `ws-auth.ts` · the module's `*.spec.ts` | all frontend · `iso/` | `corpus-flow`, `code-review` (auth-adjacent diffs) |
| container / infra | the brief · `infrastructure/` (Dockerfile, compose, Caddyfile.example) · root `package.json` + `turbo.json` | app source · `corpus/briefs/` | `bootstrap-vps-deploy` for a VPS target |
| ISO / kiosk | the brief · `iso/` (`build.c`, `scripts/`, `README.md`) | everything in `apps/` and `packages/` | — |
| docs site | the brief · `apps/docs/` (`astro.config.mjs`, `scripts/sync-corpus.mjs`, `src/content/`) | the OS source · `corpus/briefs/` | `corpus-docs-site`, `writing-guidelines` |
| any | [corpus/index.md](index.md) → ≤3 wiki pages by `summary:` triage | `briefs/` and `todos/` wholesale · `node_modules/` · `dist/` · `.turbo/` · `apps/docs/dist/` | — |

SKIP is **advisory**: a chunk that finds a SKIP area is load-bearing must report
BLOCKED rather than work around it.

## Project invariants every route inherits

Grilling a brief checks these before anything else — they are in
[CLAUDE.md](CLAUDE.md) and none of them is a per-brief negotiation: the OS is
real not simulated · the shell user is `imbatranim` with no sudo · every route
and WebSocket is authenticated · lightweight is identity · the visual identity is
locked · distribution is build-from-source.
