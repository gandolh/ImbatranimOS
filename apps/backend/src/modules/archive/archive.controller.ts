import { Body, Controller, Post } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { CompressDto, ExtractDto } from './dto/archive.dto';

/**
 * Archive extract/compress, run server-side inside the FS jail. Authenticated
 * by the global {@link SessionAuthGuard} (no `@Public()`); mutating POSTs also
 * pass the guard's Origin/CSRF check.
 */
@Controller('archive')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  /** POST /api/archive/extract { root, path, dest? } → { dest, entries, totalBytes } */
  @Post('extract')
  extract(@Body() dto: ExtractDto) {
    return this.archive.extract(dto.root, dto.path, dto.dest);
  }

  /** POST /api/archive/compress { root, paths[], dest, format } → { dest, entries, bytes } */
  @Post('compress')
  compress(@Body() dto: CompressDto) {
    return this.archive.compress(dto.root, dto.paths, dto.dest, dto.format);
  }
}
