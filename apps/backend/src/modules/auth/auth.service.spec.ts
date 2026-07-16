import { ConflictException, BadRequestException } from '@nestjs/common';
import { generateSync } from 'otplib';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { DbService } from '../../db/db.service';
import { makeConfig, makeTestDb } from './test-utils';

describe('AuthService', () => {
  let db: DbService;
  let auth: AuthService;

  beforeEach(() => {
    db = makeTestDb();
    const sessions = new SessionService(db, makeConfig());
    auth = new AuthService(db, sessions);
  });

  describe('first-run setup', () => {
    it('reports needsSetup until a user is created', async () => {
      expect(auth.isSetup()).toBe(false);
      await auth.setup('correct-horse-battery');
      expect(auth.isSetup()).toBe(true);
    });

    it('stores an argon2id hash, never the plaintext', async () => {
      await auth.setup('correct-horse-battery');
      const row = db.db.prepare('SELECT password_hash FROM auth_user WHERE id = 1').get() as {
        password_hash: string;
      };
      expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(row.password_hash).not.toContain('correct-horse-battery');
    });

    it('refuses a second setup (no silent password reset)', async () => {
      await auth.setup('correct-horse-battery');
      await expect(auth.setup('another-password')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects weak passwords', async () => {
      await expect(auth.setup('short')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('password verification', () => {
    it('accepts the correct password and rejects a wrong one', async () => {
      await auth.setup('correct-horse-battery');
      expect(await auth.verifyPassword('correct-horse-battery')).toBe(true);
      expect(await auth.verifyPassword('wrong-password-here')).toBe(false);
    });

    it('returns false (never throws) when no user exists', async () => {
      expect(await auth.verifyPassword('anything-here')).toBe(false);
    });
  });

  describe('TOTP', () => {
    it('is disabled until enrolled and confirmed', async () => {
      await auth.setup('correct-horse-battery');
      expect(auth.totpEnabled()).toBe(false);

      const { secret } = await auth.beginTotpEnroll();
      expect(auth.totpEnabled()).toBe(false); // pending, not yet confirmed

      auth.confirmTotp(generateSync({ secret }));
      expect(auth.totpEnabled()).toBe(true);
    });

    it('verifies valid codes and rejects invalid ones once enabled', async () => {
      await auth.setup('correct-horse-battery');
      const { secret } = await auth.beginTotpEnroll();
      auth.confirmTotp(generateSync({ secret }));

      expect(auth.verifyTotp(generateSync({ secret }))).toBe(true);
      expect(auth.verifyTotp('000000')).toBe(false);
    });

    it('can be disabled with the correct password', async () => {
      await auth.setup('correct-horse-battery');
      const { secret } = await auth.beginTotpEnroll();
      auth.confirmTotp(generateSync({ secret }));

      await auth.disableTotp('correct-horse-battery');
      expect(auth.totpEnabled()).toBe(false);
    });

    it('returns a QR data URL on enroll', async () => {
      await auth.setup('correct-horse-battery');
      const enroll = await auth.beginTotpEnroll();
      expect(enroll.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(enroll.uri.startsWith('otpauth://totp/')).toBe(true);
    });
  });
});
