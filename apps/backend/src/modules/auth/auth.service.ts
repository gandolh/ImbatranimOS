import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { DbService } from '../../db/db.service';
import { SessionService } from './session.service';

interface AuthUserRow {
  id: number;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
}

// argon2id — memory-hard, side-channel resistant, and the current OWASP
// recommendation. Params are the library defaults tuned up slightly; they run
// in well under a second on the target hardware while staying costly to brute.
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (OWASP minimum)
  timeCost: 2,
  parallelism: 1,
};

const MIN_PASSWORD_LENGTH = 10;
const TOTP_ISSUER = 'ImbatranimOS';
const TOTP_LABEL = 'imbatranim';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionService,
  ) {}

  private getUser(): AuthUserRow | undefined {
    return this.db.db.prepare('SELECT * FROM auth_user WHERE id = 1').get() as
      | AuthUserRow
      | undefined;
  }

  /** Has the single user been created yet? Drives the first-run wizard. */
  isSetup(): boolean {
    return !!this.getUser();
  }

  totpEnabled(): boolean {
    const u = this.getUser();
    return !!u && u.totp_enabled === 1;
  }

  /**
   * First-run: create the one and only user. No default password ever exists;
   * the account does not exist until this succeeds. Idempotency is refused —
   * re-running once set up is a 409 (prevents silent password reset).
   */
  async setup(password: string): Promise<void> {
    if (this.isSetup()) {
      throw new ConflictException('Already set up');
    }
    this.assertStrongPassword(password);
    const hash = await argon2.hash(password, ARGON2_OPTS);
    this.db.db
      .prepare('INSERT INTO auth_user (id, password_hash) VALUES (1, ?)')
      .run(hash);
  }

  /**
   * Verify a password against the stored argon2id hash. argon2.verify is
   * constant-time w.r.t. the hash, so this is not a timing oracle. Returns
   * false (never throws) for a missing user or malformed hash.
   */
  async verifyPassword(password: string): Promise<boolean> {
    const u = this.getUser();
    if (!u) return false;
    try {
      return await argon2.verify(u.password_hash, password);
    } catch {
      return false;
    }
  }

  verifyTotp(token: string): boolean {
    const u = this.getUser();
    if (!u || !u.totp_secret) return false;
    try {
      // epochTolerance allows ±30s of clock drift (one adjacent step).
      return verifySync({ token, secret: u.totp_secret, epochTolerance: 30 })
        .valid;
    } catch {
      return false;
    }
  }

  /**
   * Begin TOTP enrollment: generate a fresh secret, store it as PENDING
   * (totp_enabled stays 0), and return the otpauth URI + a QR data-URL for the
   * settings screen. TOTP is not required at login until {@link confirmTotp}.
   */
  async beginTotpEnroll(): Promise<{
    secret: string;
    uri: string;
    qrDataUrl: string;
  }> {
    if (!this.isSetup()) throw new BadRequestException('Not set up');
    const secret = generateSecret();
    const uri = generateURI({ issuer: TOTP_ISSUER, label: TOTP_LABEL, secret });
    this.db.db
      .prepare(
        'UPDATE auth_user SET totp_secret = ?, totp_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      )
      .run(secret);
    const qrDataUrl = await QRCode.toDataURL(uri);
    return { secret, uri, qrDataUrl };
  }

  /** Confirm enrollment by proving a valid code; flips TOTP on. */
  confirmTotp(token: string): void {
    const u = this.getUser();
    if (!u || !u.totp_secret) {
      throw new BadRequestException('No pending TOTP enrollment');
    }
    if (!this.verifyTotp(token)) {
      throw new UnauthorizedException('Invalid code');
    }
    this.db.db
      .prepare(
        'UPDATE auth_user SET totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      )
      .run();
  }

  /** Disable TOTP; requires the current password to prevent casual removal. */
  async disableTotp(password: string): Promise<void> {
    if (!(await this.verifyPassword(password))) {
      throw new UnauthorizedException('Invalid password');
    }
    this.db.db
      .prepare(
        'UPDATE auth_user SET totp_secret = NULL, totp_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      )
      .run();
  }

  private assertStrongPassword(password: string): void {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }
}
