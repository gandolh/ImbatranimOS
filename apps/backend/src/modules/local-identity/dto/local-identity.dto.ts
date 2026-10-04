import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LocalSetupDto {
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  setupToken?: string;
}

export class LocalSignInDto {
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class LocalPasswordDto {
  @IsString()
  @MaxLength(256)
  current!: string;

  @IsString()
  @MaxLength(256)
  next!: string;
}
