---
name: codegraph
description: Use the ImbatranimOS code graph to answer structural questions — who calls X, blast radius of X, first map of an unfamiliar area — with the measured accuracy envelope for THIS repo. Use when asked "what calls X", "what breaks if I change X", "where does feature Y live", "is it safe to rename X", or before planning a change that touches core, the SDK seam, or several add-ons. Says explicitly what the graph is wrong about here (`system.*` capability calls, the 25 duplicate `manifest` exports) and what to use instead.
---

# Code graph — ImbatranimOS

`@colbymchenry/codegraph@1.5.0`, pinned, installed globally, registered in the
committed [`.mcp.json`](../../../.mcp.json). The index lives in `.codegraph/`
(gitignored, ~35 MB, rebuilt in ~3s). It is **generated, disposable and never a
source of truth** — it reflects the last indexed state, not your uncommitted
edits.

```bash
npm run codegraph:init    # full rebuild (808 files, 9.3k nodes, 27.6k edges, ~3s)
npm run codegraph:sync    # incremental, after a pull or a batch of edits (~0.3s)
codegraph impact <sym>    codegraph callers <sym>    codegraph callees <sym>
codegraph explore "<question>"       codegraph node <sym>      codegraph status
```

The MCP server advertises **`codegraph_explore`** only; `codegraph_node`,
`_impact`, `_callers`, `_callees`, `_search`, `_files`, `_status` exist but are
unlisted (allowlist: `CODEGRAPH_MCP_TOOLS`). For anything other than open-ended
exploration, **run the CLI** — it is the primary interface here.

**Always pass `--limit`.** `callers`/`callees` default to **20** results and say
`(20)` as though that were the total. On a repo where `useSystem` has 53 caller
files, the default silently truncates.

## The envelope, measured on this repo (2026-08-23)

Method: graph output vs `grep` call sites with comment-only lines dropped and the
definition site excluded. `codegraph callers --json` returns both named-function
callers and `kind: "file"` entries — **count the file entries**: a call inside an
anonymous callback (a `it(...)` body, an inline arrow prop) produces no named
caller, only a file node. Filtering them out drops real callers.

| Symbol | Real caller files | Graph recall | Note |
|---|---|---|---|
| `useSystem` | 53 | **100%** | cross-package barrel through `@imbatranim/ui` |
| `useFileDialog` | 16 | **100%** | |
| `useSaveHotkey` / `useUnsavedGuard` | 9 / 10 | **100%** | |
| `describeFileFailure`, `toSignIns`, `extensionOf` | 2–3 | **100%** | only via the `kind:"file"` entries — named-caller-only reads 33–50% |
| `openApp` | 19 | 89% | mixed bare + `system.intents.openApp(...)` |
| `notify` | 42 | **35%** | 35 of 42 files call `system.notify(...)` |
| `manifest` | 25 | **0%** | 25 add-ons export this name |

### Use it for

- **Blast radius before editing the SDK or core.** `codegraph impact useSystem`
  returns 219 symbols across 78 files, correctly resolving
  `packages/ui` → barrel → `apps/add-ons/*`. This is the query the graph is
  genuinely good at, and the one grep is worst at.
- **Callers of a named, imported function** — an SDK hook, a `lib/` helper, a
  backend service method. Recall is 100% on every symbol measured, including
  test callers, provided you count file nodes and pass `--limit`.
- **First map of an unfamiliar area** — `codegraph explore "<question>"`, ~22 KB
  of symbols + call paths + a "no covering tests" flag, versus reading a dozen
  files.
- **Which tests cover a change** — `codegraph affected <files...>`.

### Do NOT use it for

- **Anything reached through the `system` handle.** Since brief 48 an add-on
  imports nothing from core: capabilities arrive as `system.fs.*`,
  `system.intents.openApp`, `system.notify(...)`. Those are **member
  expressions**, and the resolver does not connect them to the SDK definition —
  hence `notify` at 35%. For any capability on `SystemHandle`, the truth is
  `grep -rn "system\.notify(" apps packages` (or the namespace you care about),
  not the graph. **This is the repo's single biggest blind spot**, and it covers
  the most architecturally important surface in it.
- **`manifest`, and the other 25 names exported by two or more add-ons.**
  `codegraph callers manifest` returns **"No callers found"** while
  `apps/core/src/manifest.ts` imports 25 of them. Same class of failure, quieter:
  `formatBytes` has four separate definitions and the graph answers with one
  conflated list of 8 files. Regenerate the collision list with:

  ```bash
  for d in apps/add-ons/*/; do grep -rhoE "^export (async function|function|class|const|interface|type|enum) [A-Za-z0-9_]+" \
    "$d/src" --include='*.ts' --include='*.tsx' 2>/dev/null | awk '{print $NF}' | sort -u; done \
    | sort | uniq -d
  ```

  Current collisions: `manifest` (25 add-ons), `APP_NAME` (5), `formatBytes`,
  `errorMessage`, `ViewMode` (3 each), plus 21 two-way names including
  `listDir`, `parentDir`, `extensionOf`, `tokenize`, `Selection`, `Rect`,
  `FsEntry`, `LEGACY_KEY`, `LegacyState`. **Scope every query for these by path**
  (`grep -rn "formatBytes" apps/add-ons/notepad`) or don't ask the graph.
- **`explore` with a common verb in the question.** "how does an add-on receive
  the system handle" pulled in three unrelated `add` definitions
  (`widgetStore.add`, two pdfcore `add`s) alongside the real answer. Read past
  the noise, or ask `node SystemHandle` instead.
- **Exhaustive renames / "did I get every usage".** `grep -rnw <symbol>`, then
  confirm each hit. The graph is a scoping aid, never a completeness proof.
- **Correctness invariants.** The add-on import boundary is enforced by eslint
  (`apps/add-ons/*/eslint.config.js`) — run `npm run lint`, don't ask the graph
  whether the seam holds.

## The working rule

Lead with the graph to **locate and scope**; verify with `grep` or a guard test
before **acting on completeness**. Concretely, for this repo: graph for impact
and named-function callers, grep for anything with a `.` before it and anything
named `manifest`.

Numbers and rationale are filed in
[`corpus/wiki/code-graph.md`](../../../corpus/wiki/code-graph.md); routing is in
[`corpus/routing.md`](../../../corpus/routing.md). Re-run the benchmark if the
repo's shape changes materially — the envelope is per-repo and goes stale.
