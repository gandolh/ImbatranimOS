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
import {
  OptionalPathQueryDto,
  RequiredPathQueryDto,
} from './dto/path-query.dto';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(@Query() q: OptionalPathQueryDto) {
    return this.notesService.list(q.path);
  }

  @Get('file')
  readFile(@Query() q: RequiredPathQueryDto) {
    return this.notesService.readFile(q.path);
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
  deleteFile(@Query() q: RequiredPathQueryDto) {
    return this.notesService.deleteFile(q.path);
  }

  @Post('directory')
  createDirectory(@Body() dto: CreateDirectoryDto) {
    return this.notesService.createDirectory(dto);
  }

  @Delete('directory')
  deleteDirectory(@Query() q: RequiredPathQueryDto) {
    return this.notesService.deleteDirectory(q.path);
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
