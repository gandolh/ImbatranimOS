import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import type { Response } from 'express';
import { basename } from 'path';
import { FilesService } from './files.service';
import { MulterExceptionFilter } from './multer-exception.filter';
import {
  WriteContentDto,
  CreateDirectoryDto,
  MoveDto,
  CopyDto,
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
  list(@Query('root') root: string, @Query('path') path?: string) {
    if (!root) throw new BadRequestException('root is required');
    return this.filesService.list(root, path ?? '');
  }

  /** GET /api/files/stat?root=&path= → Entry */
  @Get('stat')
  stat(@Query('root') root: string, @Query('path') path: string) {
    if (!root || !path) throw new BadRequestException('root and path required');
    return this.filesService.stat(root, path);
  }

  /** GET /api/files/content?root=&path= → { path, content } (text) */
  @Get('content')
  content(@Query('root') root: string, @Query('path') path: string) {
    if (!root || !path) throw new BadRequestException('root and path required');
    return this.filesService.readFile(root, path);
  }

  /** GET /api/files/download?root=&path= → raw binary stream */
  @Get('download')
  async download(
    @Query('root') root: string,
    @Query('path') path: string,
    @Res() res: Response,
  ) {
    if (!root || !path) throw new BadRequestException('root and path required');
    const stream = await this.filesService.readFileStream(root, path);
    const filename = basename(path);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  /** POST /api/files/upload  multipart: root, path, file → Entry */
  @Post('upload')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body('root') root: string,
    @Body('path') path: string,
  ) {
    if (!root || !file) throw new BadRequestException('root and file required');
    const virtualPath = path || file.originalname;
    return this.filesService.uploadFile(root, virtualPath, file.buffer);
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
  async deleteItem(@Query('root') root: string, @Query('path') path: string) {
    if (!root || !path) throw new BadRequestException('root and path required');
    await this.filesService.delete(root, path);
  }
}
