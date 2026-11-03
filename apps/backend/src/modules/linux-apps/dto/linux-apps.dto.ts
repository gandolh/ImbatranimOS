import { IsString, Length, Matches } from 'class-validator';

/** The desktop session (one tab) the request comes from. */
const SESSION = /^[A-Za-z0-9_-]{16,64}$/;

export class SessionDto {
  @IsString()
  @Matches(SESSION)
  session!: string;
}

export class InstallDto extends SessionDto {
  /** A nixpkgs attribute; checked against the release's list before anything runs. */
  @IsString()
  @Length(1, 200)
  attr!: string;
}

export class RemoveDto extends SessionDto {
  /** A profile element's name, from the installed list. */
  @IsString()
  @Length(1, 200)
  name!: string;
}
