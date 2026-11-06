import type { NextFunction, Request, Response } from 'express';

import {
  EMBEDDER_POLICY,
  FRAME_EMBEDDER_POLICY,
  securityHeaders,
  securityHeadersFor,
} from './security-headers';

/** Run the middleware against a recording response. */
function headersOf(
  middleware: ReturnType<typeof securityHeadersFor>,
): Record<string, string> {
  const set: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      set[name.toLowerCase()] = value;
    },
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  middleware({} as Request, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  return set;
}

/** The whole policy, directive by directive: a change to any one fails here. */
const POLICY = [
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
];

describe('the desktop’s security headers', () => {
  it('lets scripts on the page compile WebAssembly, and changes no other directive', () => {
    expect(headersOf(securityHeaders)['content-security-policy']).toBe(
      POLICY.join('; '),
    );
    expect(
      headersOf(securityHeadersFor('http://localhost:3002'))[
        'content-security-policy'
      ],
    ).toBe([...POLICY, "frame-src 'self' http://localhost:3002"].join('; '));
  });

  it('still refuses injected text as script: no unsafe-eval, no unsafe-inline', () => {
    const csp = headersOf(securityHeaders)['content-security-policy'];
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src '));
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('makes the desktop cross-origin isolated', () => {
    const headers = headersOf(securityHeaders);
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe(EMBEDDER_POLICY);
    expect(['require-corp', 'credentialless']).toContain(EMBEDDER_POLICY);
  });

  it('keeps the headers it set before', () => {
    const headers = headersOf(securityHeaders);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['strict-transport-security']).toBeUndefined();
  });

  it('gives the frames it serves the policy every browser accepts under either value', () => {
    expect(FRAME_EMBEDDER_POLICY).toBe('require-corp');
  });
});
