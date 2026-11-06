import { IsIn, IsString, Length, Matches } from 'class-validator';

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

export class MoveDto extends SessionDto {
  /** A newer snapshot of this release, or a newer release. */
  @IsIn(['update', 'upgrade'])
  kind!: 'update' | 'upgrade';

  /** The commit the last check offered; anything else is refused. */
  @IsString()
  @Matches(/^[0-9a-f]{40}$/)
  commit!: string;
}
