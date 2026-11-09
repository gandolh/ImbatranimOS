import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * POST /api/archive/extract — unpack `path` (a .zip, a tarball, or a lone
 * .gz/.xz/.bz2 file inside `root`) into `dest`. When `dest` is omitted the
 * service derives a sibling folder from the archive name; a lone compressed
 * file unpacks beside itself instead. Every path is jailed via
 * `FilesService.resolveSafe`; entry names are never trusted.
 */
export class ExtractDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  /**
   * Destination directory (root-relative). Optional — derived if absent. For
   * a lone compressed file it is the folder the one output file goes into.
   */
  @IsOptional()
  @IsString()
  dest?: string;

  /**
   * Extract only these entries. Absent means the whole archive.
   *
   * **This list is untrusted input from the client**, which is precisely the
   * zip-slip vector this module was hardened against — so every name is run
   * through the same `resolveEntry` jail as a full extract, and is additionally
   * required to match an entry the archive actually declares. A DTO cannot make
   * that safe on its own; see `ArchiveService.extract`.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10_000)
  entries?: string[];
}

/** GET /api/archive/list?root=&path= — read an archive's contents, extracting nothing. */
export class ListDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

/** GET /api/archive/job/:id — poll a running extraction. */
export interface ArchiveJob {
  id: string;
  state: 'running' | 'done' | 'failed';
  /** 0-100. Best-effort: entries processed over entries expected. */
  percent: number;
  entriesDone: number;
  entriesTotal: number;
  /** Set when state === 'done'. */
  result?: { dest: string; entries: number; totalBytes: number };
  /** Set when state === 'failed'. */
  error?: string;
}

/** One row of an archive listing. */
export interface ArchiveEntry {
  /** Entry name as it will be extracted (already decoded and jail-checked). */
  name: string;
  /** Uncompressed size in bytes, or null when the format does not say. */
  size: number | null;
  /** Compressed size, when the format records it. */
  compressedSize: number | null;
  directory: boolean;
  /** ISO date, when the format records one. */
  modified: string | null;
  /**
   * True when the stored name was not valid UTF-8 and had to be repaired. The UI
   * shows this, because the extracted filename will not match the original.
   */
  nameRepaired: boolean;
}

export interface ArchiveListing {
  /** A {@link TarFlavour}, `zip`, or a {@link LoneFlavour}. */
  format: string;
  entries: ArchiveEntry[];
  /** Entries the archive declares that this module will refuse to extract. */
  refused: { name: string; reason: string }[];
  /** True when the zip is encrypted — see the service for why that is refused. */
  encrypted: boolean;
  truncated: boolean;
}

export type ArchiveFormat = 'zip' | 'targz';

/**
 * Tar flavours this module can READ. Creating is a smaller set — see
 * {@link ArchiveService.detectFormat} for the verified read/create matrix and why
 * `.tar.xz` is read-only in the shipped image.
 */
export type TarFlavour = 'tar' | 'targz' | 'tarbz2' | 'tarxz';

/**
 * One compressed file with no tar inside (`notes.txt.gz`): it unpacks to one
 * file beside itself, named without the suffix.
 */
export type LoneFlavour = 'gz' | 'xz' | 'bz2';

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
