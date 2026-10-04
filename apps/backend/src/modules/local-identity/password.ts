import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

/**
 * The owner's password, hashed with scrypt from `node:crypto`.
 *
 * scrypt rather than argon2id (which the pre-Ward store used): no native
 * module, so a Node upgrade cannot break sign-in, and the server ISO's musl
 * build needs nothing compiled. Ward made the same choice for the same reason.
 *
 * Stored as `scrypt$<log2 N>$<r>$<p>$<salt>$<hash>`, base64url, so the cost can
 * be raised later and old hashes still verify.
 */

const LOG_N = 15; // N = 32768: ~32 MiB and tens of milliseconds per check
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  logN: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: 2 ** logN, r, p, maxmem: MAX_MEMORY },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, LOG_N, R, P);
  return [
    'scrypt',
    LOG_N,
    R,
    P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** True only for the password the hash was made from. Constant-time compare. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, logN, r, p, salt, expected] = parts;
  const want = Buffer.from(expected, 'base64url');
  const got = await derive(
    password,
    Buffer.from(salt, 'base64url'),
    Number(logN),
    Number(r),
    Number(p),
  );
  return got.length === want.length && timingSafeEqual(got, want);
}
