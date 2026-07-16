import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { UpsertRecentDto } from './dto/upsert-recent.dto';
import { CreateFileDto, UpdateFileDto } from './dto/file-ops.dto';
import { CreateDirectoryDto } from './dto/directory-ops.dto';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(@Query('path') path?: string) {
    return this.notesService.list(path);
  }

  @Get('file')
  readFile(@Query('path') path: string) {
    return this.notesService.readFile(path);
  }

  @Post('file')
  createFile(@Body() dto: CreateFileDto) {
    return this.notesService.createFile(dto);
  }

  @Put('file')
  updateFile(@Body() dto: UpdateFileDto) {
    return this.notesService.updateFile(dto);
  }

  @Delete('file')
  deleteFile(@Query('path') path: string) {
    return this.notesService.deleteFile(path);
  }

  @Post('directory')
  createDirectory(@Body() dto: CreateDirectoryDto) {
    return this.notesService.createDirectory(dto);
  }

  @Delete('directory')
  deleteDirectory(@Query('path') path: string) {
    return this.notesService.deleteDirectory(path);
  }

  @Get('recent')
  getRecent() {
    return this.notesService.getRecent();
  }

  @Post('recent')
  upsertRecent(@Body() dto: UpsertRecentDto) {
    return this.notesService.upsertRecent(dto);
  }
}
