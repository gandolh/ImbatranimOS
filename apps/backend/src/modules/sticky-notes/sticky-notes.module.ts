import { Module } from '@nestjs/common';
import { StickyNotesController } from './sticky-notes.controller';
import { StickyNotesService } from './sticky-notes.service';

@Module({
  controllers: [StickyNotesController],
  providers: [StickyNotesService],
})
export class StickyNotesModule {}
