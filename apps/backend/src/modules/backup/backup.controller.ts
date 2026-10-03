import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import type { Response } from 'express';
import { MulterExceptionFilter } from '../files/multer-exception.filter';
import { BackupService } from './backup.service';
import { RestoreApplyDto } from './dto/backup.dto';

/**
 * Upload cap for a restore, in bytes. Deliberately its own knob rather than the
 * file-manager's 100 MB: a backup of a real home volume is routinely larger than
 * any single file a user uploads, and sharing the cap would make restore fail on
 * exactly the machines that most need it.
 */
const MAX_BACKUP_UPLOAD_BYTES =
  Number(process.env.BACKUP_MAX_UPLOAD_BYTES) || 4 * 1024 * 1024 * 1024;

/**
 * Back up and restore the home volume (brief 80).
 *
 * Every route is authenticated by the global `WardAuthGuard`; none carries
 * `@Public()`. This is the most security-sensitive controller in the OS — the
 * download is the whole machine in one file — so it is worth writing down why
 * there is no second sign-in prompt on it: the archive contains nothing the
 * session cannot already read. `db.sqlite` sits inside the home volume and is
 * already reachable through `/api/files`, and since the Ward cutover it holds
 * no credentials at all (brief 150 dropped the old tables). A re-prompt here
 * would be theatre. Restore is different, and does require a typed
 * confirmation, because it is destructive rather than merely revealing.
 */
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  /** GET /api/backup/info → sizes and exclusions, before committing to a download */
  @Get('info')
  info() {
    return this.backup.info();
  }

  /**
   * GET /api/backup → streams `imbatranim-home-YYYY-MM-DD.tar.gz`.
   *
   * Chunked, with no `Content-Length`: the size is not known until tar has
   * finished, and buffering the archive to learn it would defeat the point.
   */
  @Get()
  async download(@Res() res: Response): Promise<void> {
    const backup = await this.backup.openBackupStream();
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${backup.filename}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    // A proxy that buffered this would reintroduce the disk/memory cost the
    // streaming design exists to avoid.
    res.setHeader('X-Accel-Buffering', 'no');

    // `pipeline`, not `.pipe()` (brief 142). A client that disconnected left
    // `.pipe()` unpiped and tar's stdout paused: tar blocked on a full pipe
    // forever, `done` never settled, and `dispose()` never ran, so every later
    // backup answered 409 until a restart. Whichever side fails first now
    // reaches `finally`, and `dispose()` kills a still-running tar. `Promise.all`
    // also handles the other promise's later rejection.
    try {
      await Promise.all([pipeline(backup.stream, res), backup.done]);
    } catch {
      // Headers are already out, so the status cannot be changed. Destroying the
      // socket truncates the gzip stream, which fails its own CRC at the client
      // — a partial backup can never look like a complete one.
      res.destroy();
    } finally {
      await backup.dispose();
    }
  }

  /**
   * POST /api/backup/restore/inspect (multipart `file`) → what a restore would do.
   *
   * Two steps rather than one so the manifest, the date and the list of things
   * that would be replaced can be shown *before* the user commits — and so the
   * archive is uploaded once, not twice.
   */
  @Post('restore/inspect')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: MAX_BACKUP_UPLOAD_BYTES },
    }),
  )
  inspect(@UploadedFile() file?: { path: string }) {
    if (!file) throw new BadRequestException('Choose a backup file to restore');
    return this.backup.inspect(file.path);
  }

  /** POST /api/backup/restore/apply { id, confirm: 'RESTORE' } → what was restored */
  @Post('restore/apply')
  @HttpCode(HttpStatus.OK)
  async apply(@Body() dto: RestoreApplyDto) {
    // No `signedOut` any more (brief 149): a restore cannot change who may sign
    // in, because credentials are Ward's and are not in this database. The
    // cookie is left alone; clearing Ward's cookie from here would sign
    // somebody out of the whole estate as a side effect of a restore.
    return this.backup.apply(dto.id);
  }
}
