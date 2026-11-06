import type { Response } from 'express';

import { FRAME_EMBEDDER_POLICY } from '../../security-headers';

/**
 * The policy of everything served under `marketplace/sandbox/<token>/` (brief
 * 158, contract B). It replaces the desktop's (`security-headers.ts`) on
 * those responses only.
 *
 * - `sandbox allow-scripts allow-pointer-lock`: the document has an opaque
 *   origin even when its URL is opened in a tab, not only inside the
 *   desktop's `<iframe sandbox>`. It never shares the desktop's origin, its
 *   storage or its cookie.
 * - `default-src 'none'` and `'self'` for the rest: the app cannot reach
 *   another origin. On `'self'` it carries no credentials (no cookie from an
 *   opaque origin, and `Origin: null` fails the guard's CSRF check).
 * - `frame-ancestors 'self'` (and `X-Frame-Options: SAMEORIGIN`): only the
 *   desktop may frame it, not another site.
 * - `Access-Control-Allow-Origin: *` with no credentials: the frame's module
 *   scripts are CORS requests from origin `null`.
 * - `Cross-Origin-Embedder-Policy: require-corp`: the desktop is
 *   cross-origin isolated, and a frame inside it must send a policy too.
 *   What the frame loads without CORS (images, media) comes back from an
 *   origin that isn't its own, opaque one, which is why every response here
 *   also carries `Cross-Origin-Resource-Policy: cross-origin`. The frame
 *   itself is not isolated: its opaque origin isn't granted the
 *   `cross-origin-isolated` permission, so a URL app has WebAssembly but no
 *   SharedArrayBuffer.
 */
export const SANDBOX_CSP = [
  'sandbox allow-scripts allow-pointer-lock',
  "default-src 'none'",
  "script-src 'self' blob: 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ');

/**
 * Set the sandbox's headers, overriding the desktop's and the CORS
 * middleware's. Called first in every sandbox handler, so a 404 carries them
 * too.
 */
export function applySandboxHeaders(res: Response): void {
  res.setHeader('Content-Security-Policy', SANDBOX_CSP);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.removeHeader('Access-Control-Allow-Credentials');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', FRAME_EMBEDDER_POLICY);
  // The desktop's opener policy means nothing in a frame, and it is only
  // read when the frame's URL is opened in a tab, where a page sandboxed by
  // its CSP has no use for it (and a browser may refuse to load a sandboxed
  // page that has one).
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // CSP doesn't cover DNS prefetching, so a `<link rel="dns-prefetch">` to a
  // name that encodes data would reach the attacker's DNS server. Off.
  res.setHeader('X-DNS-Prefetch-Control', 'off');
}
