import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * All git routes point at ONE repo, identified the same way the file manager
 * identifies a directory: a named `root` (see FilesService ROOTS / `home`) plus
 * an optional `path` under it. The directory is resolved through
 * `FilesService.resolveSafe` — the FS jail — and only used as an execa `cwd`;
 * it is never a client-controlled absolute path.
 */
class RepoRefDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsOptional()
  @IsString()
  path?: string;
}

/** GET /api/git/status?root=&path= */
export class StatusQueryDto extends RepoRefDto {}

/** GET /api/git/log?root=&path=&limit= */
export class LogQueryDto extends RepoRefDto {
  // Query strings arrive as text; ValidationPipe `transform` coerces via @Type.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** GET /api/git/diff?root=&path=&staged=&file= */
export class DiffQueryDto extends RepoRefDto {
  // Accept the common truthy string encodings for a query-string boolean.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  staged?: boolean;

  @IsOptional()
  @IsString()
  file?: string;
}

/** POST /api/git/stage | /api/git/unstage  { root, path?, paths[] } */
export class PathsBodyDto extends RepoRefDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paths: string[];
}

/** POST /api/git/commit  { root, path?, message } */
export class CommitBodyDto extends RepoRefDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}
