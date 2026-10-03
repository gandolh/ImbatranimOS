import {
  SignJWT,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  type CryptoKey,
  type JWK,
} from 'jose';
import { createWardClient, type WardClientOptions } from './ward.client';
import {
  ACCESS_TOKEN_ALG,
  ACCESS_TOKEN_AUDIENCE,
  WardAuthenticationError,
  WardConfigurationError,
  WardUnavailableError,
} from './ward.types';

/**
 * Brief 146 — the Ward client itself, which every e2e suite swaps out.
 *
 * Ported from Ward's reference client tests (`wzd_auth/client/src`), adapted to
 * this file's API: a local Ed25519 key pair, and one injectable `fetch` that
 * serves both the key set and `/introspect`.
 */

const ORIGIN = 'https://estate.test';
const BASE = '/ward-api';
const KID = 'key-1';

type Responder = (url: string, init?: RequestInit) => Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let privateKey: CryptoKey;
let publicJwk: JWK;
let spki: string;
let foreignKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair(ACCESS_TOKEN_ALG, { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: KID,
    alg: ACCESS_TOKEN_ALG,
  };
  spki = await exportSPKI(pair.publicKey);
  foreignKey = (await generateKeyPair(ACCESS_TOKEN_ALG)).privateKey;
});

/** A token Ward would mint, with `overrides` applied to its claims. */
async function token(
  overrides: Record<string, unknown> = {},
  key: CryptoKey = privateKey,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    sub: 'subject_owner',
    jti: 'jti-1',
    sid: 'sid-1',
    iat: now,
    exp: now + 15 * 60,
    iss: ORIGIN,
    aud: ACCESS_TOKEN_AUDIENCE,
    ...overrides,
  };
  for (const [k, v] of Object.entries(claims))
    if (v === undefined) delete claims[k];
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ACCESS_TOKEN_ALG, kid: KID, typ: 'JWT' })
    .sign(key);
}

const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('ward client', () => {
  let jwks: Responder;
  let introspect: Responder;
  let jwksCalls: number;
  let introspectCalls: number;
  let clock: number;

  const client = (extra: Partial<WardClientOptions> = {}) =>
    createWardClient({
      publicOrigin: ORIGIN,
      apiBasePath: BASE,
      appKey: 'app-key',
      now: () => clock,
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.endsWith('/.well-known/jwks.json')) {
          jwksCalls++;
          return jwks(url, init);
        }
        if (url.endsWith('/introspect')) {
          introspectCalls++;
          return introspect(url, init);
        }
        throw new Error(`unexpected fetch ${url}`);
      },
      ...extra,
    });

  beforeEach(() => {
    jwksCalls = 0;
    introspectCalls = 0;
    clock = 1_000_000;
    jwks = () => Promise.resolve(json(200, { keys: [publicJwk] }));
    introspect = () =>
      Promise.resolve(
        json(200, {
          active: true,
          subject: 'subject_owner',
          username: 'owner',
          grants: { 'imbatranim-os': ['owner'] },
        }),
      );
  });

  describe('verify', () => {
    it('accepts a token Ward signed', async () => {
      const claims = await client().verify(await token());
      expect(claims.sid).toBe('sid-1');
    });

    it('fetches the key set once and reuses it', async () => {
      const c = client();
      await c.verify(await token());
      await c.verify(await token({ jti: 'jti-2' }));
      expect(jwksCalls).toBe(1);
    });

    it('rejects alg: none', async () => {
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', sid: 's' })}.`;
      await expect(client().verify(unsigned)).rejects.toBeInstanceOf(
        WardAuthenticationError,
      );
    });

    it('rejects HS256 signed with the public key as the secret', async () => {
      const now = Math.floor(Date.now() / 1000);
      const forged = await new SignJWT({
        sub: 'subject_owner',
        jti: 'j',
        sid: 's',
        iat: now,
        exp: now + 60,
        iss: ORIGIN,
        aud: ACCESS_TOKEN_AUDIENCE,
      })
        .setProtectedHeader({ alg: 'HS256', kid: KID, typ: 'JWT' })
        .sign(new TextEncoder().encode(spki));
      await expect(client().verify(forged)).rejects.toBeInstanceOf(
        WardAuthenticationError,
      );
    });

    it('rejects a token signed by a foreign key under the same kid', async () => {
      await expect(
        client().verify(await token({}, foreignKey)),
      ).rejects.toBeInstanceOf(WardAuthenticationError);
    });

    it.each([
      ['a wrong issuer', { iss: 'https://elsewhere.test' }],
      ['a wrong audience', { aud: 'someone-else' }],
      ['no sid', { sid: undefined }],
      ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ])('rejects %s as an authentication failure', async (_name, overrides) => {
      await expect(
        client().verify(await token(overrides)),
      ).rejects.toBeInstanceOf(WardAuthenticationError);
    });

    it.each([
      [
        'a refused connection',
        () => Promise.reject(new TypeError('fetch failed')),
      ],
      ['a 500', () => Promise.resolve(json(500, { error: 'boom' }))],
      [
        'a body that is not a key set',
        () => Promise.resolve(json(200, { nope: true })),
      ],
    ])(
      'reports %s on the key set as Ward unavailable, never signed out',
      async (_name, responder) => {
        jwks = responder;
        await expect(client().verify(await token())).rejects.toBeInstanceOf(
          WardUnavailableError,
        );
      },
    );

    it('reports a key-set timeout as Ward unavailable', async () => {
      jwks = (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      await expect(
        client({ jwksTimeoutMs: 50 }).verify(await token()),
      ).rejects.toBeInstanceOf(WardUnavailableError);
    });
  });

  describe('introspect', () => {
    it('is cached for 30 s, then asked again', async () => {
      const c = client();
      const t = await token();
      await c.introspect(t);
      clock += 29_999;
      await c.introspect(t);
      expect(introspectCalls).toBe(1);
      clock += 2;
      await c.introspect(t);
      expect(introspectCalls).toBe(2);
    });

    it('collapses 50 concurrent cold calls into one request', async () => {
      const c = client();
      const t = await token();
      const results = await Promise.all(
        Array.from({ length: 50 }, () => c.introspect(t)),
      );
      expect(introspectCalls).toBe(1);
      expect(results.every((r) => r.active)).toBe(true);
    });

    it("maps Ward's 401 to a configuration error, and never caches it", async () => {
      introspect = () =>
        Promise.resolve(json(401, { error: 'invalid_app_key' }));
      const c = client();
      const t = await token();
      await expect(c.introspect(t)).rejects.toBeInstanceOf(
        WardConfigurationError,
      );
      await expect(c.introspect(t)).rejects.toBeInstanceOf(
        WardConfigurationError,
      );
      expect(introspectCalls).toBe(2);
    });

    it.each([
      ['a 500', () => Promise.resolve(json(500, {}))],
      [
        'bad JSON',
        () => Promise.resolve(new Response('not json', { status: 200 })),
      ],
      [
        'an active session with no subject',
        () => Promise.resolve(json(200, { active: true, username: 'owner' })),
      ],
      [
        'a refused connection',
        () => Promise.reject(new TypeError('fetch failed')),
      ],
    ])('reports %s as Ward unavailable', async (_name, responder) => {
      introspect = responder;
      await expect(client().introspect(await token())).rejects.toBeInstanceOf(
        WardUnavailableError,
      );
    });
  });

  describe('readAccessCookie', () => {
    const c = () => client();
    it('is undefined with no header', () => {
      expect(c().readAccessCookie(undefined)).toBeUndefined();
    });
    it('treats an empty value as absent', () => {
      expect(c().readAccessCookie('ward_session=; other=1')).toBeUndefined();
    });
    it('finds the cookie among others, in a string or an array header', () => {
      expect(c().readAccessCookie('a=1; ward_session=tok; b=2')).toBe('tok');
      expect(c().readAccessCookie(['a=1', 'ward_session=tok2'])).toBe('tok2');
    });
  });

  describe('authenticate', () => {
    it('returns the introspected caller with the token sid', async () => {
      const caller = await client().authenticate(
        `ward_session=${await token()}`,
      );
      expect(caller).toMatchObject({ subject: 'subject_owner', sid: 'sid-1' });
    });

    it('is an authentication error for an inactive session', async () => {
      introspect = () => Promise.resolve(json(200, { active: false }));
      await expect(
        client().authenticate(`ward_session=${await token()}`),
      ).rejects.toBeInstanceOf(WardAuthenticationError);
    });
  });
});
