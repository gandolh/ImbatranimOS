import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { basename } from 'path';
import { tmpdir } from 'os';
import { FilesService } from './files.service';
import { MulterExceptionFilter } from './multer-exception.filter';
import {
  WriteContentDto,
  CreateDirectoryDto,
  MoveDto,
  CopyDto,
  ListQueryDto,
  RootPathQueryDto,
} from './dto/files.dto';

/**
 * Upload size cap (bytes). Env-overridable; defaults to 100 MB. Uploads over
 * this are rejected by multer before they reach the service.
 */
const MAX_UPLOAD_BYTES =
  Number(process.env.FILES_MAX_UPLOAD_BYTES) || 100 * 1024 * 1024;

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /** GET /api/files?root=&path=  → Entry[] */
  @Get()
  list(@Query() q: ListQueryDto) {
    return this.filesService.list(q.root, q.path ?? '');
  }

  /** GET /api/files/content?root=&path= → { path, content } (text) */
  @Get('content')
  content(@Query() q: RootPathQueryDto) {
    return this.filesService.readFile(q.root, q.path);
  }

  /** GET /api/files/download?root=&path= → raw binary stream */
  @Get('download')
  async download(@Query() q: RootPathQueryDto, @Res() res: Response) {
    const stream = await this.filesService.readFileStream(q.root, q.path);
    const filename = basename(q.path);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizeHeaderFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  /** POST /api/files/upload  multipart: root, path, file → Entry */
  @Post('upload')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      // Stream the upload straight to a temp file on disk instead of buffering
      // the whole thing in the heap; the service moves it into the jail.
      storage: diskStorage({ destination: tmpdir() }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: { path: string; originalname: string },
    @Body('root') root: string,
    @Body('path') path: string,
  ) {
    if (!root || !file) throw new BadRequestException('root and file required');
    const virtualPath = path || file.originalname;
    return this.filesService.uploadFile(root, virtualPath, file.path);
  }

  /** PUT /api/files/content  body: { root, path, content } → Entry */
  @Put('content')
  writeContent(@Body() dto: WriteContentDto) {
    return this.filesService.writeFile(dto.root, dto.path, dto.content);
  }

  /** POST /api/files/directory  body: { root, path } → Entry */
  @Post('directory')
  createDirectory(@Body() dto: CreateDirectoryDto) {
    return this.filesService.createDirectory(dto.root, dto.path);
  }

  /** POST /api/files/move  body: { root, from, to } → Entry */
  @Post('move')
  move(@Body() dto: MoveDto) {
    return this.filesService.move(dto.root, dto.from, dto.to);
  }

  /** POST /api/files/copy  body: { root, from, to } → Entry */
  @Post('copy')
  copy(@Body() dto: CopyDto) {
    return this.filesService.copy(dto.root, dto.from, dto.to);
  }

  /** DELETE /api/files?root=&path= → 204 */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(@Query() q: RootPathQueryDto) {
    await this.filesService.delete(q.root, q.path);
  }
}

/**
 * Make a filename safe to embed in the quoted `filename=` parameter: drop
 * characters that would break the quoting or inject header structure. The
 * unrestricted UTF-8 name still travels in the `filename*=` parameter, which
 * modern browsers prefer.
 */
function sanitizeHeaderFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\\x00-\x1f]/g, '_');
}
