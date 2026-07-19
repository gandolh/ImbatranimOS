import type { Request, Response, NextFunction } from 'express';

/**
 * Content-Security-Policy for the served desktop. Hand-rolled (no helmet) and
 * deliberately conservative:
 *
 *  - script-src 'self'         — the Vite prod build emits only external module
 *                                scripts (no inline <script>), so no
 *                                'unsafe-inline' is needed here.
 *  - style-src  'unsafe-inline'+ the desktop positions windows / sticky notes
 *                                with inline style={{...}} attributes, and the
 *                                Google Fonts CSS is pulled in via an @import in
 *                                the bundled stylesheet, so fonts.googleapis.com
 *                                must be an allowed style source.
 *  - font-src   fonts.gstatic.com — where Google Fonts serves the woff2 files.
 *  - connect-src 'self'        — same-origin API (XHR) plus the terminal
 *                                WebSocket (/api/pty). Per CSP3, 'self' covers
 *                                ws://wss:// on the page's own origin, so the
 *                                bare ws:/wss: wildcards (SEC-9) are dropped —
 *                                an XSS can no longer open a socket to an
 *                                attacker host. Re-verify the terminal connects
 *                                on each target browser after this tightening.
 *  - frame-ancestors 'none'    — clickjacking defence (pairs with X-Frame-Options).
 *
 * HSTS is intentionally NOT set here — TLS is terminated by the reverse proxy
 * (see infrastructure/README.md / Caddyfile.example), so Strict-Transport-Security
 * is the proxy's responsibility, not the app's.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self'",
  "connect-src 'self'",
].join('; ');

/**
 * Minimal, dependency-free security headers applied to every response
 * (API JSON and the served static desktop alike). Registered via app.use()
 * in main.ts before the router.
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', CSP);
  next();
}
