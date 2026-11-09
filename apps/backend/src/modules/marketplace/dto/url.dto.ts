import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class InspectUrlDto {
  /** What the owner pasted. `parseSourceUrl` says what is wrong with it, in words the pane shows. */
  @IsString()
  @MaxLength(2000)
  url!: string;
}

export class InstallUrlDto {
  /** The `pending` id an inspection answered with. An unknown one is a 404, not a 400. */
  @IsString()
  @MaxLength(100)
  pending!: string;

  /**
   * The owner trusts the checked commit of an app built from source that is
   * not verified. Without it such an app is refused (403).
   */
  @IsOptional()
  @IsBoolean()
  trust?: boolean;
}
