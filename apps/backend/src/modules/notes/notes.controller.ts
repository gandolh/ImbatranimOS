import { Body, Controller, Get, Post } from '@nestjs/common';
import { NotesService } from './notes.service';
import { UpsertRecentDto } from './dto/upsert-recent.dto';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get('recent')
  getRecent() {
    return this.notesService.getRecent();
  }

  @Post('recent')
  upsertRecent(@Body() dto: UpsertRecentDto) {
    return this.notesService.upsertRecent(dto);
  }
}
