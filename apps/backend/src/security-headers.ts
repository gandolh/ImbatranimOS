import type { Request, Response, NextFunction } from 'express';

/**
 * Content-Security-Policy for the served desktop. Hand-rolled (no helmet) and
 * deliberately conservative:
 *
 *  - script-src 'self'         — the Vite prod build emits only external module
 *                                scripts (no inline <script>), so no
 *                                'unsafe-inline' is needed here.
 *    'wasm-unsafe-eval'        — lets scripts already on the page compile
 *                                WebAssembly. It does not let injected text
 *                                run as JavaScript (that is 'unsafe-eval',
 *                                still off), and catalog apps already run in
 *                                this page, so a `.wasm` of theirs can do
 *                                nothing their JavaScript couldn't. The CSP
 *                                can't tell one `.wasm` from another; what
 *                                may ship is the catalog reviewers' rule (see
 *                                marketplace/README.md, WebAssembly).
 *  - style-src  'unsafe-inline' — the desktop positions windows / sticky notes
 *                                with inline style={{...}} attributes. Fonts are
 *                                vendored and served from 'self' (see
 *                                core/src/index.css), so no Google Fonts origin
 *                                is whitelisted — the policy stays 'self'-only,
 *                                and the offline kiosk / air-gapped LAN renders
 *                                its real fonts with no external fetch or IP leak.
 *  - font-src   'self' data:   — the vendored woff2 files, same origin.
 *  - connect-src 'self'        — same-origin API (XHR) plus the terminal
 *                                WebSocket (/api/pty). Per CSP3, 'self' covers
 *                                ws://wss:// on the page's own origin, so the
 *                                bare ws:/wss: wildcards (SEC-9) are dropped —
 *                                an XSS can no longer open a socket to an
 *                                attacker host. Re-verify the terminal connects
 *                                on each target browser after this tightening.
 *  - frame-ancestors 'none'    — clickjacking defence (pairs with X-Frame-Options).
 *
 * Cross-origin isolation (COOP + COEP, below) is on, so apps on the page get
 * SharedArrayBuffer and WebAssembly threads.
 *
 * HSTS is intentionally NOT set here — TLS is terminated by the reverse proxy
 * (see infrastructure/README.md / Caddyfile.example), so Strict-Transport-Security
 * is the proxy's responsibility, not the app's.
 */
function policy(browserProxyOrigin: string | null): string {
  return [
    // With no frame-src below, this is also where the desktop's frames may
    // go, and that fences a sandboxed app from a URL: see
    // frame-src.
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "connect-src 'self'",
    // The Browser app frames its proxy origin, that one origin and
    // no other. Without it, frames stay at default-src 'self'.
    //
    // This directive is also the fence on where a sandboxed app from a URL
    // can navigate its own frame. That navigation is checked
    // against this page's policy, the frame's parent, and the CSP the frame
    // carries cannot stop it. Every origin added here is one an unreviewed
    // app can send data to by navigating there (`location = …?<data>`), so
    // widening frame-src gives URL apps a way out.
    ...(browserProxyOrigin ? [`frame-src 'self' ${browserProxyOrigin}`] : []),
  ].join('; ');
}

/**
 * The desktop's `Cross-Origin-Embedder-Policy`: the switch between the two
 * values that give cross-origin isolation.
 *
 * `require-corp` is the one every browser that isolates knows. Safari has no
 * `credentialless` and reads it as no policy, so with it an iPhone loses
 * threads (and nothing else). `credentialless` is the fallback if
 * `require-corp` blocks something on the page that headers can't fix: it
 * loads another origin's no-cors resources without cookies instead of
 * refusing them. Flipping this flips the deploy; Vite's dev server keeps a
 * copy in apps/core/vite.config.ts, which stops compiling until it matches.
 * Frames the desktop serves send `require-corp` whatever this says (see
 * {@link FRAME_EMBEDDER_POLICY}).
 */
export const EMBEDDER_POLICY: 'require-corp' | 'credentialless' =
  'require-corp';

/**
 * What a document the desktop frames sends: its Browser's proxy origin and a
 * URL app's sandboxed frame. A frame inside an isolated page must send a
 * policy of its own, and `require-corp` is accepted under either value of
 * {@link EMBEDDER_POLICY} by every browser, where a `credentialless` frame
 * would be refused by Safari.
 */
export const FRAME_EMBEDDER_POLICY = 'require-corp';

/**
 * The two headers that make the desktop cross-origin isolated
 * (`crossOriginIsolated` is true, SharedArrayBuffer exists). The embedder
 * policy asks little of the page: under the CSP above, everything it loads
 * is same-origin, and the frames it holds send headers of their own. Also
 * sent by Vite's dev server (apps/core/vite.config.ts), which serves the
 * desktop's page in development.
 */
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': EMBEDDER_POLICY,
} as const;

/**
 * Minimal, dependency-free security headers applied to every response
 * (API JSON and the served static desktop alike). Registered via app.use()
 * in main.ts before the router.
 *
 * `browserProxyOrigin` is the Browser's proxy origin when it is on; the policy
 * then lets the desktop frame it.
 */
export function securityHeadersFor(browserProxyOrigin: string | null) {
  const csp = policy(browserProxyOrigin);
  return function securityHeaders(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', csp);
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  };
}

/** The headers with the Browser off. */
export const securityHeaders = securityHeadersFor(null);
