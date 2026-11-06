> SUPERSEDED 2026-11-06, before any work: the owner keeps this in the backlog until its open questions are grilled, so it became the todo [kit-apps-may-run-webassembly](../../todos/kit-apps-may-run-webassembly.md), which holds the draft. Promoting that todo makes a new brief with a new number. Spec kept for the record.

# Brief 53 — Kit apps may run WebAssembly

## Context

The desktop's CSP (`apps/backend/src/security-headers.ts`) is `script-src
'self'` without `'wasm-unsafe-eval'`, so no app in the desktop's page can
compile WebAssembly. This was never a decision; the comment calls the policy
"deliberately conservative". It has cost the office suite twice:
- CAD reads DWG through a server, because LibreDWG is WASM;
- PDF ships without pdf.js's JPEG2000 and JBIG2 decoders.

URL apps' sandboxed frame already allows it
(`apps/backend/src/modules/marketplace/sandbox-headers.ts`), and the
marketplace already serves `.wasm` as `application/wasm`. The marketplace
README even says WASM files go beside the module, which can't work today for
a native app.

[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#1-the-three-kinds-of-app)
defines the second kind of app: a kit UI with a WASM engine from an npm
package, pinned by the lockfile. The owner approved it on 2026-11-06
("looks good, write the briefs").

## Owner decisions

Approved 2026-11-06: allow WASM in the desktop's page. The smaller calls,
with the default this brief builds:

1. **Where the WASM may come from.** Default: any file the page is allowed
   to fetch (`'self'`), since the CSP can't tell an npm package's `.wasm`
   from any other. The rule "from an npm package, never compiled at install
   or committed" is recorded as policy for the catalog's reviewers, not
   enforced in code.
2. **Threads.** Default: none. No COOP or COEP headers, so WASM threads and
   `SharedArrayBuffer` stay off. Add them only when an app needs threads,
   in its own brief.

## What to do

1. Add `'wasm-unsafe-eval'` to the desktop's `script-src`. Explain it in the
   file's comment: it lets scripts already on the page compile WASM, but
   doesn't let injected text run as JavaScript, and catalog apps already
   run unsandboxed JavaScript in the page. Update the header tests.
2. A test app proves it: a small kit app fixture whose module instantiates a
   tiny `.wasm` (a few bytes, an `add` export) served beside it. Run it in
   the marketplace tests, and in the dev container from a `file://`
   repository as earlier walks did.
3. Fix the marketplace README's WASM line. It should say what works and
   point at the reviewers' rule from decision 1.
4. Record the decision in
   [decisions-marketplace.md](../../wiki/decisions-marketplace.md), with the
   rejected alternative: the old policy, which forced WASM into a server.
5. Corpus: the research pages, status, log. The office repo's "No
   WebAssembly" invariant is changed by its own brief 04, not here.

## Files you OWN

- `apps/backend/src/security-headers.ts` and its tests
- a WASM fixture under the marketplace tests
- `marketplace/README.md` (the WASM line)
- the corpus pages in steps 4 and 5

## Files you must NOT touch

- `sandbox-headers.ts` (URL apps already have it).
- Any other CSP directive.

## Acceptance

- Tests green. In Chrome against the dev container, the fixture's
  `add(2, 3)` is 5 and the console shows no CSP violation.
- The desktop's other headers are byte-for-byte unchanged apart from
  `script-src`.
