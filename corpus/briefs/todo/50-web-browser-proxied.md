# Brief 50 — Web browser (proxied-interactive)

Status: **todo** · Net-new capability (grilled 2026-07-19). **HARD →
senior/opus.** Spans three surfaces: new **backend** Wisp module
`apps/backend/src/modules/wisp/`, new **core** proxy surface (service-worker
registration + a `<ProxyView>`/hook exported from `@imbatranim/core`), and a
thin new add-on `apps/add-ons/browser/`. **Security-reviewed before commit.**
Depends on brief 51 (the image must be able to install a new add-on's deps).

## Problem

No way to actually browse the web from inside the OS — open Google, click a
result, read the article, play a YouTube video with sound. A naive approach
fails not because of iframes but because real sites send
`X-Frame-Options`/`Content-Security-Policy: frame-ancestors` that forbid being
embedded, and cross-origin `fetch` is blocked by CORS + our own same-origin
CSP. Making real sites load interactively requires a **rewriting proxy** that
strips framing headers and rewrites URLs/JS so the page behaves as if loaded
from its real origin.

## Decisions (grilled 2026-07-19) — establishes a 2nd, stricter SSRF stance; log it

- **Fidelity: Tier 2, proxied-interactive.** Real sites you can click through,
  not a reader/readability viewer. (Tier 1 reader and Tier 3 headless-Chromium
  streaming were both rejected.)
- **Engine: Scramjet (Mercury Workshop), adopted — not hand-rolled.**
  Service-worker interception + WASM URL/JS rewriter + a Wisp backend.
  Succeeds Ultraviolet (deprecated). **AGPL-3.0-only** → clean against our
  AGPL repo. Consumed as **prebuilt dist assets** — NO Rust/WASM toolchain in
  the image or on the host. Its predecessor and a from-scratch rewriter were
  both rejected (dead codebase / multi-month, never-finished).
- **The proxied page renders in a sandboxed iframe.** The "without iframes"
  idea is dropped: the iframe is the sandbox the SW mediates; iframes were
  never the blocker (headers were).
- **Housing: OS capability, not a self-contained add-on.** A pure add-on can't
  own a backend WS or an origin-level service worker. So: **backend** gains a
  Wisp module (mirroring the PTY WebSocket's authed pattern); **core** owns SW
  registration and exposes a proxy surface (`<ProxyView url>` / hook) through
  its `src/index.ts` barrel; the **browser add-on stays thin** (URL bar,
  back/forward, reload) and consumes core only. eslint import-boundary intact.
- **Egress: auth-gate + SSRF filter — the OPPOSITE stance from brief 43.** The
  Wisp WS sits behind the global `SessionAuthGuard`, AND blocks outbound to
  link-local (`169.254.0.0/16`, incl. cloud metadata `169.254.169.254`),
  RFC1918 (`10/8`, `172.16/12`, `192.168/16`), loopback, and `::1`, resolved
  **at DNS time** so a hostname can't smuggle a private IP. Rationale for
  differing from the REST client (brief 43, which deliberately *allows* private
  ranges): here the proxy loads **arbitrary third-party pages whose own JS
  drives it** — one XSS in a proxied page becomes an SSRF cannon into our
  infra. The REST client only fires URLs the owner explicitly typed. **Record
  BOTH stances in `wiki/decisions.md` + `log.md`; they differ on purpose.**
- **Profile: OS-level, synced, encrypted.** Scramjet's cookie jar is
  client-side (in the *viewing* browser, not Alpine). To honour "the computer
  is the container," serialize it → **authed backend endpoint** → store
  **encrypted** (key derived from the existing account secret) in the home
  volume / `db.sqlite`, keyed to the account; rehydrate the client store on
  Browser open. Login then follows the container across restarts AND across
  whichever physical browser opens the OS. (Client-IndexedDB-only was
  rejected — pins the profile to one laptop.)
- **v1 = thin MVP, prove the pipe.** One window: URL bar + back/forward/reload
  + the proxied iframe. **No tabs yet.** Done = *Google search → click result
  → read article* AND *a YouTube video plays with audio*. Reuse the existing
  **Bookmarks** add-on via an `openApp('browser', { url })` intent — do NOT
  rebuild bookmarks inside Browser. Tabs/history/new-tab page come after.
- **DRM is out of scope.** YouTube standard playback works through Scramjet;
  Widevine/EME sites (Netflix etc.) will NOT — origin-bound, no proxy fixes it.
  Set that expectation; don't chase it.
- **Lazy-load the entire proxy subsystem** (mitigates the slim-identity dent —
  see Invariants). Nothing proxy-related loads until the Browser app is first
  opened: **do not register the service worker, fetch the Scramjet WASM/dist,
  or open the Wisp WS at desktop boot.** Register/hydrate on first Browser
  launch; tear down or idle when it closes. A user who never opens the browser
  pays **zero** runtime cost and near-zero startup cost — only the on-disk MB
  remain. Follows the eager-bundle-lazy-load precedent (brief 33). The add-on
  is already `lazy` in its manifest; this extends the same deferral to the SW
  registration + WASM load + WS connect, which are *core/origin*-level, not
  bundle-level, so they need explicit deferral (they won't be code-split for
  free).

## Fix

**Backend** `apps/backend/src/modules/wisp/`: a Wisp WebSocket endpoint
(`wisp-server-node` or equivalent embedded in Nest — not a Python sidecar,
which breaks the one-container identity) behind `SessionAuthGuard`; an
**SSRF egress filter** wrapping the connect path (resolve host → reject
link-local/RFC1918/loopback/`::1` on every target and every DNS answer,
before opening the socket). A **profile controller** (`GET`/`PUT
/api/browser/profile`, owner-authed) storing the encrypted cookie-jar blob
under the home root. Jest tests: private-range blocked (v4 + v6 + hostname
resolving to private), public host allowed, auth required, profile round-trips
encrypted. Register in `app.module.ts`.

**Core**: serve the Scramjet dist (SW + WASM + client) as static assets at a
**dedicated scope path** (e.g. `/proxy/`) so the SW never intercepts the
desktop's own traffic; register the SW from core (first SW in the OS — none
exists today) **lazily — only on first Browser launch, never at desktop
boot** (see the lazy-load decision); the WASM/dist fetch and the Wisp WS
connect are likewise deferred to first launch. Export a `<ProxyView url>`
component (or hook) that drives this init on mount + the profile sync plumbing
through `src/index.ts`. **This forces CSP changes** —
`frame-src`, `worker-src`, `script-src` for the SW, and `connect-src` for the
Wisp WS — which intersects the open **SEC-9** `csp-connect-src-ws-wildcard`
todo; scope the additions, don't wildcard.

**Frontend** `apps/add-ons/browser/`: add-on scaffold; manifest
(`icon: Globe`, lazy, `multiInstance: false` for v1); URL bar + back/forward/
reload + `<ProxyView>`; accept an `openApp` intent carrying a `url`. Deps:
`@imbatranim/core` + `lucide-react` only.

## Must preserve (regression surface)

- **SSRF filter enforced on every target + every DNS answer** — the security
  review will try `169.254.169.254`, a hostname resolving to `127.0.0.1`, an
  IPv6-mapped private addr, and a redirect toward an internal host.
- Wisp WS behind the session guard; no `@Public()`; no default-open relay.
- The proxy SW scoped so it never intercepts desktop/API traffic.
- Third-party cookies stored **encrypted**, never plaintext, only in the volume.
- CSP additions **scoped**, not wildcarded (don't regress SEC-9).
- **No proxy cost at idle** — SW unregistered, no WASM fetched, no Wisp WS open
  until the Browser app is first launched. A boot without opening Browser must
  show zero proxy network/registration activity.
- Prod image stays slim-ish — see Invariants; justify the added weight.

## Verify bar

`turbo typecheck`, backend + add-on lint/format green, `backend#test` green
(new Wisp + profile tests), `turbo build` ok. **Adversarial security review**
(SSRF bypass via DNS/IPv6/redirect, auth bypass on the WS, cookie-blob
plaintext/leak, SW scope escape, CSP hole) — findings fixed before commit.
**Human-gated:** in the running container, Google search → click → read an
article; a YouTube video plays with audio; log into a site, restart the
container, still logged in; a proxied request to `169.254.169.254` is refused.
Boot the desktop **without** opening Browser → confirm (DevTools) no service
worker registered, no Scramjet WASM fetched, no Wisp WS opened until launch.

## Invariants

Auth everywhere (Wisp WS + profile route owner-authed). **Lightweight is in
tension**: Scramjet dist/WASM + `wisp-server-node` add real weight against the
~150 MB slim target — call the delta out in the outcome and keep it as small
as the engine allows (dev-time asset, prebuilt, no toolchain). **The lazy-load
decision is what keeps this on-soul**: idle runtime/startup cost is zero (only
on-disk MB remain), so "snappy" is preserved for the user who never opens the
browser. The disk delta is the one bit that can't be deferred — name it in
`wiki/decisions.md` as the first accepted heavyweight subsystem. Real-not-
simulated (a real browser — on-soul). No sudo, not privileged. Build-from-
source preserved (Scramjet vendored/npm dist, AGPL-compatible).

## Out of scope

Tabs, session history, new-tab/start page, downloads manager, DRM/Widevine
sites, ad-blocking, extensions, multi-profile, and Tier-3 headless streaming.
