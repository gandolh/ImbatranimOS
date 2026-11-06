---
title: Kit apps may run WebAssembly
created: 2026-11-06
status: promoted
tags: [imbatranim-apps]
---

# Kit apps may run WebAssembly

The desktop's CSP lets kit apps run WebAssembly, so an app can use a WASM engine from an npm package in the tab. One header, a test fixture, and the decision recorded. Its first user is PDF's JPEG2000 and JBIG2 decoders in imbatranim-office; CAD's DWG stays on the server (owner, 2026-11-06).

Drafted as a brief on 2026-11-06 and kept in the backlog: grill the open
questions below when the work starts, then promote this to a numbered brief.


> PROMOTED 2026-11-06 to [brief 67](../briefs/todo/67-kit-apps-may-run-webassembly-with-threads.md), after the grill. The brief is the spec; this todo keeps the questions as asked.
## Open questions (grill before starting)

Settled: the owner approved the imbatranim-apps plan on 2026-11-06 ("looks good, write the briefs"); WASM engines from npm packages may run in the desktop's page.

Confirmed in the grill on 2026-11-06: worth doing now, for PDF's decoders and the WASM app type, even with DWG staying on the server.

1. **Is "WASM only from an npm package, never compiled at install or committed" a rule for the catalog's reviewers rather than code, since the CSP can't tell one `.wasm` from another?** Answered 2026-11-06: yes, a reviewers' rule.
2. **Do WASM threads stay off (no COOP or COEP headers) until an app needs them?** Answered 2026-11-06: turn threads on now. The desktop sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (everything it loads is already same-origin under the CSP), and every frame it serves sends matching headers: the Browser app's proxy origin and the sandboxed URL-app frames. The brief tests the Browser app, URL apps, Linux windows, Office and PDF in Chrome on Android, Chrome on the desktop and Safari on iPhone, and stops to report if something breaks that the headers can't fix. `credentialless` is the fallback to try if `require-corp` blocks the proxy.

## Draft brief

### Context

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

[research-imbatranim-apps-layout.md](../wiki/research-imbatranim-apps-layout.md#1-the-three-kinds-of-app)
defines the second kind of app: a kit UI with a WASM engine from an npm
package, pinned by the lockfile. The owner approved it on 2026-11-06
("looks good, write the briefs").

### What to do

1. Add `'wasm-unsafe-eval'` to the desktop's `script-src`. Explain it in the
   file's comment: it lets scripts already on the page compile WASM, but
   doesn't let injected text run as JavaScript, and catalog apps already
   run unsandboxed JavaScript in the page. Update the header tests.
2. A test app proves it: a small kit app fixture whose module instantiates a
   tiny `.wasm` (a few bytes, an `add` export) served beside it. Run it in
   the marketplace tests, and in the dev container from a `file://`
   repository as earlier walks did.
3. Fix the marketplace README's WASM line. It should say what works and
   point at the reviewers' rule from question 1.
4. Record the decision in
   [decisions-marketplace.md](../wiki/decisions-marketplace.md), with the
   rejected alternative: the old policy, which forced WASM into a server.
5. Corpus: the research pages, status, log. The office repo's "No
   WebAssembly" invariant is changed by its todo
`pdf-decodes-jpeg2000-and-jbig2-images`, not here.

### Files you OWN

- `apps/backend/src/security-headers.ts` and its tests
- a WASM fixture under the marketplace tests
- `marketplace/README.md` (the WASM line)
- the corpus pages in steps 4 and 5

### Files you must NOT touch

- `sandbox-headers.ts` (URL apps already have it).
- Any other CSP directive.

### Acceptance

- Tests green. In Chrome against the dev container, the fixture's
  `add(2, 3)` is 5 and the console shows no CSP violation.
- The desktop's other headers are byte-for-byte unchanged apart from
  `script-src`.
