# Brief 43 — REST API client

Status: **todo** · Promotes [rest-api-client-addon](../../todos/rest-api-client-addon.md).
Wave D. **HARD → senior/opus.** New **backend** proxy module
`apps/backend/src/modules/http-proxy/` + new frontend package
`apps/add-ons/rest-api-client/`. **Security-reviewed before commit.**

## Problem

No Postman/Insomnia-style tool. Devs want to compose HTTP requests, send them,
and inspect responses. Browser `fetch` from the SPA is blocked by the CSP
(`connect-src` is same-origin only) and by CORS — so the request must go through
an authed backend proxy.

## Decisions (grilled 2026-07-18) — establishes an SSRF stance; log it

- **Authed backend proxy.** `POST /api/http/request { method, url, headers?,
  body? }` → backend performs the outbound request and returns `{ status,
  statusText, headers, bodyBase64, truncated, elapsedMs }`. Behind the global
  `SessionAuthGuard` — **only the single logged-in owner can call it** (that is
  the primary control; this is the user's own curl, not an open relay).
- **SSRF posture (NEW decision — add to `wiki/decisions.md` + `log.md`):** the
  proxy is a deliberate outbound tool for its owner, so it MAY reach LAN/localhost
  by design (a dev testing local services) — we do NOT hard-block private ranges,
  because that would gut the tool and the caller is already the trusted owner.
  The guardrails that DO apply:
  1. **Scheme allowlist**: `http`/`https` only — reject `file:`, `ftp:`,
     `gopher:`, `data:`, etc.
  2. **Response caps**: hard max body size (stream + abort past the cap, mark
     `truncated`) and a request timeout — a huge/slow target can't OOM or hang.
  3. **Redirect cap**: follow at most N (e.g. 5) redirects; re-apply the scheme
     allowlist on each hop; never downgrade to a non-http(s) scheme.
  4. **Header hygiene**: drop hop-by-hop headers; don't forward our session
     cookie or auth to the target; let the user set their own headers.
  5. **No credential reflection**: the proxy never attaches the OS's own creds.
  Document explicitly that, being owner-authed, reaching internal hosts is
  intended — the controls above bound blast radius, they don't pretend it's a
  public-safe SSRF filter.
- **Collections/history persisted in the home FS** (web-OS identity: user data
  lives in the volume). Save collections/history as JSON under the home root via
  the existing authed files API (e.g. `~/.config/rest-client/collections.json`),
  not localStorage. History bounded.
- Node's built-in `fetch`/`undici` for the outbound call (no new dep); enforce
  the caps via `AbortController` + manual redirect handling or `redirect:
  'manual'` looping.

## Fix

**Backend** `apps/backend/src/modules/http-proxy/`: `http-proxy.module.ts`,
`http-proxy.controller.ts` (`@Controller('http')`, `POST request`),
`http-proxy.service.ts` (URL parse + scheme check, `AbortController` timeout,
manual redirect loop with per-hop scheme re-check, streamed size cap →
base64 body), `dto/http-proxy.dto.ts` (class-validator: method enum, url string,
headers record, optional body). Register in `app.module.ts`. Jest unit tests:
scheme rejected, redirect cap + per-hop scheme re-check, size cap → `truncated`,
timeout, hop-by-hop headers stripped. Keep backend test/lint green.

**Frontend** `apps/add-ons/rest-api-client/`: add-on scaffold; manifest
(`icon: Send` or `Webhook`, lazy, `multiInstance: false`); request builder
(method, URL, headers, body tabs), a response viewer (status, headers, pretty
body), and a collections/history sidebar persisted to the FS via core `api`.
Deps: `@imbatranim/core` + `lucide-react`.

## Must preserve (regression surface)

- **Scheme allowlist + caps enforced on every hop** — the security review will
  try `file://`, a redirect from https→file, a huge/slow body, header smuggling.
- The proxy never forwards our own session cookie/Authorization to the target.
- Auth on the route (global guard); no `@Public()`.
- Backend tests + lint green.

## Verify bar

`turbo typecheck`, backend + add-on lint/format green, `backend#test` green
(new tests), `turbo build` ok. **Adversarial security review** (scheme bypass,
redirect-to-file, size/timeout DoS, header injection/smuggling, cookie leakage,
CRLF in URL) — findings fixed before commit. **Human-gated:** compose + send a
real GET/POST, inspect response; collections persist across reload; a `file://`
URL is refused.

## Invariants

Auth everywhere (owner-only), lightweight (no new dep — built-in fetch),
identity locked. The SSRF stance is a **recorded decision**, not silent — it goes
in decisions.md with the guardrails.

## Out of scope

GraphQL/websocket clients, request scripting/env-vars/pre-request scripts, OAuth
flows, import from Postman, streaming/SSE responses, cookie jar.

## Outcome (2026-07-18) — Wave D commit `4be1777`

Shipped. Backend `apps/backend/src/modules/http-proxy/` (`POST /api/http/request`,
owner-authed): built-in `fetch`/`undici`, scheme allowlist (http/https) re-checked
on the initial URL AND every redirect hop (manual, cap 5, no scheme downgrade to
file:/etc), streamed 10 MB body cap + 30 s AbortController timeout, hop-by-hop +
`proxy-*` headers stripped, outbound headers built ONLY from user input (OS
cookie/auth structurally unreachable), CRLF rejected in URL + header values, and
(hardening) the user's own `Authorization`/`Cookie` dropped on a cross-host
redirect. Collections/history persisted to `~/.config/rest-client/collections.json`
via the authed files API. 13 unit tests. **Security review: safe as-is, no
exploitable hole** (all SSRF controls verified empirically). SSRF stance recorded
in `wiki/decisions.md`. No new dep. `multiInstance: false`. Human-gated: send a
real GET/POST, `file://` refused, collections persist.
