import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DockerService } from './docker.service';

@Controller('docker')
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get('containers')
  listContainers() {
    return this.dockerService.listContainers();
  }

  @Post('containers/:id/start')
  startContainer(@Param('id') id: string) {
    return this.dockerService.startContainer(id);
  }

  @Post('containers/:id/stop')
  stopContainer(@Param('id') id: string) {
    return this.dockerService.stopContainer(id);
  }

  @Post('containers/:id/restart')
  restartContainer(@Param('id') id: string) {
    return this.dockerService.restartContainer(id);
  }

  @Delete('containers/:id')
  removeContainer(@Param('id') id: string) {
    return this.dockerService.removeContainer(id);
  }

  @Get('containers/:id/logs')
  getLogs(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.dockerService.getLogs(id, limit ? parseInt(limit, 10) : 100);
  }
}
