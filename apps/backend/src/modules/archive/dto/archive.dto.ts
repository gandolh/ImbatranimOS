import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * POST /api/archive/extract — unpack `path` (a .zip/.tar/.tar.gz/.tgz inside
 * `root`) into `dest`. When `dest` is omitted the service derives a sibling
 * folder from the archive name. Every path is jailed via
 * `FilesService.resolveSafe`; entry names are never trusted.
 */
export class ExtractDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  /** Destination directory (root-relative). Optional — derived if absent. */
  @IsOptional()
  @IsString()
  dest?: string;
}

export type ArchiveFormat = 'zip' | 'targz';

/**
 * POST /api/archive/compress — pack `paths[]` (files/dirs inside `root`) into
 * the archive at `dest`, as a zip or a gzipped tar.
 */
export class CompressDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paths: string[];

  @IsString()
  @IsNotEmpty()
  dest: string;

  @IsIn(['zip', 'targz'])
  format: ArchiveFormat;
}
