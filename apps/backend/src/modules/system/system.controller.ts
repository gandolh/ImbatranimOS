import { Controller, Get } from '@nestjs/common';
import { SystemService, SystemStats } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('stats')
  getStats(): Promise<SystemStats> {
    return this.systemService.getStats();
  }
}
