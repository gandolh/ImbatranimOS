import { Controller, Get, Post, Param } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  getServices() {
    return this.servicesService.getServices();
  }

  @Post(':id/start')
  startService(@Param('id') id: string) {
    return this.servicesService.startService(id);
  }

  @Post(':id/stop')
  stopService(@Param('id') id: string) {
    return this.servicesService.stopService(id);
  }

  @Get(':id/logs')
  getLogs(@Param('id') id: string) {
    return { logs: this.servicesService.getLogs(id).join('') };
  }
}
