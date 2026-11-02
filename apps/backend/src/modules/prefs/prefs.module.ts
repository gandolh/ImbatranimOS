import { Module } from '@nestjs/common';
import { PrefsController } from './prefs.controller';
import { PrefsService } from './prefs.service';

/** Durable user config. `DbModule` is global, so nothing to import. */
@Module({
  controllers: [PrefsController],
  providers: [PrefsService],
  exports: [PrefsService],
})
export class PrefsModule {}
