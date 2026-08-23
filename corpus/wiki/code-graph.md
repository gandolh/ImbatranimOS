---
summary: The generated code-graph layer (codegraph 1.5.0) and its accuracy measured on THIS repo, 2026-08-23 — 100% caller recall on imported functions and correct cross-package barrel resolution, but ~35% on anything called through the `system` handle and 0% on `manifest`, which 25 add-ons export. Read before trusting a structural answer; the working skill is .claude/skills/codegraph/SKILL.md.
updated: 2026-08-23
---

# The code-graph layer

The corpus answers *why* the code is the way it is. This page is about the
complementary *what* layer — a generated symbol index that answers "who calls
X", "what breaks if I change X", "where does feature Y live" without an agent
grepping and reading twenty files to find out.

Stood up 2026-08-23 per `corpus-flow` §0b. Before it, `routing.md` sent every
structural question to grep.

## What is wired

- **`@colbymchenry/codegraph@1.5.0`**, installed globally and **pinned** — MIT
  but effectively single-maintainer, so it is a supply-chain surface even
  running locally. Telemetry is off (it defaults on).
- **`.mcp.json` is committed**, not left to a per-dev `codegraph install`. A
  manual per-dev step reliably never gets run, and the layer quietly dies. The
  path is env-overridable (`${CODEGRAPH_INDEX_PATH:-.}`) so a worktree can point
  at one canonical index instead of re-indexing a throwaway tree.
- **`npm run codegraph:init` / `codegraph:sync`** — one line each, so onboarding
  isn't a hunt through the tool's docs.
- **`.codegraph/` is gitignored** at the repo root. The index is disposable and
  machine-local; it is **never a source of truth** and never a runtime
  dependency.

Index: 808 files, 9,290 nodes, 27,643 edges, ~35 MB, full rebuild ~3s,
incremental sync ~0.3s. Backend is `node:sqlite` built-in — the native path, not
the 5–10× slower WASM fallback.

## The accuracy envelope, measured here

The tool is `tree-sitter + a heuristic resolver`, not a compiler, so vendor
claims hold only for the queries it happens to be good at. Measured against grep
(comment-only lines dropped, definition site excluded) on 2026-08-23:

| Query shape | Result |
|---|---|
| Callers of an imported function (`useSystem` 53 files, `useFileDialog` 16, `useSaveHotkey` 9) | **100%** |
| Cross-package barrel — `packages/ui` → `@imbatranim/ui` → 78 add-on files | **resolves correctly**; `impact useSystem` returns 219 symbols |
| Calls through the `system` handle (`notify`: 35 of 42 files write `system.notify(...)`) | **35%** |
| `openApp` — mixed bare calls and `system.intents.openApp(...)` | 89% |
| `manifest` — exported by 25 add-ons | **0%** — reports "No callers found" |

Two mechanical gotchas that make the numbers look worse than they are:

- **`callers`/`callees` default to 20 results** and print `(20)` as if it were
  the total. Always pass `--limit`.
- **Count the `kind: "file"` entries.** A call inside an anonymous callback (a
  test body, an inline arrow prop) yields no named caller node, only a file
  node. Three symbols read as 33–50% recall until those are counted, then 100%.

## What this means for how we work

**The blind spot is architecturally central.** Brief 48 made the `system` handle
the only way an add-on touches the OS, and member expressions are exactly what
the resolver cannot follow. So the graph is weakest on the seam this project
cares most about. The rule that falls out: **graph for `impact` and named-function
callers; grep for anything with a dot before it, and for anything named
`manifest`.**

**Twenty-six export names collide across add-on packages** — `manifest` (25),
`APP_NAME` (5), `formatBytes`, `errorMessage`, `ViewMode` (3 each), and 21
two-way names. Parallel packages with parallel roles produce parallel names; the
resolver conflates them. Queries for those names must be scoped by path or not
asked of the graph at all. The regeneration command for the list is in the
project skill.

**Rename completeness is still grep's job**, as it always was. The graph scopes;
`grep -rnw` proves.

## Where the working rules live

The operational skill — commands, the *use it for* / *do NOT use it for* tables,
the collision list — is [`.claude/skills/codegraph/SKILL.md`](../../.claude/skills/codegraph/SKILL.md),
in the project rather than in personal skills, because the numbers above are
per-repo and cannot be written once and reused. Routing is in
[`routing.md`](../routing.md). Re-run the benchmark if the repo's shape changes
materially; a stale envelope is worse than none.
