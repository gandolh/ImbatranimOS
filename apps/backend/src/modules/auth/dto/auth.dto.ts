import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetupDto {
  // Full strength enforcement lives in AuthService; the DTO does the cheap
  // structural check so obviously-bad input is rejected before hashing.
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  password: string;
}

export class LoginDto {
  @IsString()
  password: string;

  // Present only when TOTP is enabled for the account.
  @IsOptional()
  @IsString()
  token?: string;
}

export class TotpTokenDto {
  @IsString()
  token: string;
}

export class DisableTotpDto {
  @IsString()
  password: string;
}
