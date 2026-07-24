import { Module } from '@nestjs/common';
import { PrefsController } from './prefs.controller';
import { PrefsService } from './prefs.service';

@Module({
  controllers: [PrefsController],
  providers: [PrefsService],
})
export class PrefsModule {}
