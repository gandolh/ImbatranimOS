# Brief 67 — Kit apps may run WebAssembly, with threads

## Context

The desktop's CSP (`apps/backend/src/security-headers.ts`) is `script-src
'self'` without `'wasm-unsafe-eval'`, so no app in the desktop's page can
compile WebAssembly. This was never a decision; the comment calls the policy
"deliberately conservative". It has cost the office suite twice:
- CAD reads DWG through a server, where it stays (owner, 2026-11-06);
- PDF ships without pdf.js's JPEG2000 and JBIG2 decoders, which is
  imbatranim-office's brief 06 and the first user of this one.

Some of the pieces are in place already:
- URL apps' sandboxed frame already allows WASM
  (`apps/backend/src/modules/marketplace/sandbox-headers.ts`);
- the marketplace serves `.wasm` as `application/wasm`;
- its README says WASM files go beside the module, which can't work today
  for a native app.

WASM threads need cross-origin isolation: `Cross-Origin-Opener-Policy:
same-origin` plus `Cross-Origin-Embedder-Policy`, on the page and on every
frame inside it. The owner chose to turn threads on now. Promoted from the
todo `kit-apps-may-run-webassembly`
([decisions-app-identity-and-trust.md](../../wiki/decisions-app-identity-and-trust.md#wasm-threads-are-on)).

## Owner decisions (settled 2026-11-06)

1. WASM in the desktop's page. "Only from an npm package, pinned by the
   lockfile, never compiled at install or committed" is a rule for the
   catalog's reviewers, since the CSP can't tell one `.wasm` from another.
2. Threads now. The desktop sends `Cross-Origin-Opener-Policy: same-origin`
   and `Cross-Origin-Embedder-Policy: require-corp`. Everything it loads is
   already same-origin under the CSP. Every frame it serves sends matching
   headers: the Browser app's proxy origin, and the sandboxed URL-app frames
   until they are retired. `credentialless` is the fallback if `require-corp`
   blocks the proxy.

## What to do

1. Add `'wasm-unsafe-eval'` to the desktop's `script-src`, and say why in the
   file's comment: it lets scripts already on the page compile WASM, but
   doesn't let injected text run as JavaScript, and catalog apps already run
   in the page.
2. Add COOP and COEP to the desktop's responses. Add the matching headers to
   the Browser's proxy origin (`apps/backend/src/modules/browser/`) and to
   the sandbox responses (`sandbox-headers.ts`). Check `crossOriginIsolated`
   is true in the desktop.
3. A fixture kit app proves both: a tiny `.wasm` with an `add` export served
   beside its module, and a worker sharing a `SharedArrayBuffer` with the
   page. It runs in the marketplace tests and in the dev container from a
   `file://` repository.
4. Walk the things isolation can break, in Chrome on the desktop, Chrome on
   Android and Safari on iPhone:
   - the Browser app on two real sites;
   - a URL app;
   - a Linux app's window;
   - Office's Docs and PDF;
   - Hollow;
   - Files' media preview.

   If something breaks that the headers can't fix, try `credentialless`. If
   that fails too, stop and report with what broke.
5. Fix the marketplace README's WASM line, pointing at the reviewers' rule.
6. Corpus: decisions-app-identity-and-trust.md (the outcome, with which COEP
   value held), the research pages, status, log. The office repo's
   invariant changes in its own brief 06.

## Files you OWN

- `apps/backend/src/security-headers.ts`, `sandbox-headers.ts`, the Browser
  proxy's response headers, and their tests
- the fixture, `marketplace/README.md` (the WASM line), the corpus pages

## Files you must NOT touch

- Any other CSP directive.

## Acceptance

- Tests green.
- In Chrome against the dev container, the fixture's `add(2, 3)` is 5, its
  worker shares memory, `crossOriginIsolated` is true, and no CSP or COEP
  error shows.
- Step 4's walk holds on all three browsers, or the outcome says what broke
  and what was kept.
