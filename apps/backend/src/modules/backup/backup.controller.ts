import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import type { Request, Response } from 'express';
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
 * Every route is authenticated by the global `SessionAuthGuard`; none carries
 * `@Public()`. This is the most security-sensitive controller in the OS — the
 * download is the whole machine in one file — so it is worth writing down why
 * there is no second password prompt on it: the archive contains nothing the
 * session cannot already read. `db.sqlite`, credential hash and TOTP secret
 * included, sits inside the home volume and is already reachable through
 * `/api/files`. A re-prompt here would be theatre. Restore is different, and
 * does require a typed confirmation, because it is destructive rather than
 * merely revealing.
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
  async apply(
    @Body() dto: RestoreApplyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.backup.apply(dto.id);
    /*
     * The cookie is left alone, and `signedOut` is now always false.
     *
     * This used to revoke every session with the database swap and clear the
     * cookie, because the restored database carried the backup's credentials.
     * Credentials are Ward's now and live nowhere in this database, so a
     * restore cannot change who may sign in — and clearing Ward's cookie from
     * here would be this app signing somebody out of the whole estate as a side
     * effect of a restore, which it has no business doing.
     *
     * The field is kept rather than removed so the frontend's response shape
     * does not change in the same release as the behaviour; it should be
     * dropped once the UI stops reading it.
     */
    return { ...result, signedOut: false };
  }
}
