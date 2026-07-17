import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Query params for endpoints that need a root and an optional sub-path. */
export class ListQueryDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsOptional()
  @IsString()
  path?: string;
}

/** Query params for endpoints that need both a root and a path. */
export class RootPathQueryDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

export class WriteContentDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class CreateDirectoryDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

export class MoveDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;
}

export class CopyDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;
}
