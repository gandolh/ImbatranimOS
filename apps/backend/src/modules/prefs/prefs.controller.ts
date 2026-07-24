import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { PrefsService } from './prefs.service';
import type { PrefsMap } from './dto/prefs.dto';

@Controller('prefs')
export class PrefsController {
  constructor(private readonly prefsService: PrefsService) {}

  @Get()
  findAll(): PrefsMap {
    return this.prefsService.findAll();
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  upsertMany(@Body() body: PrefsMap): void {
    this.prefsService.upsertMany(body);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('key') key: string): void {
    this.prefsService.remove(key);
  }
}
