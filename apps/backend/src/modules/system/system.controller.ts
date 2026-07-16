import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import {
  AboutInfo,
  ProcessInfo,
  SystemService,
  SystemStats,
} from './system.service';

class KillProcessDto {
  @IsOptional()
  @IsIn(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP'])
  signal?: NodeJS.Signals;
}

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('stats')
  getStats(): Promise<SystemStats> {
    return this.systemService.getStats();
  }

  @Get('processes')
  getProcesses(): Promise<ProcessInfo[]> {
    return this.systemService.getProcesses();
  }

  @Get('about')
  getAbout(): Promise<AboutInfo> {
    return this.systemService.getAbout();
  }

  @Post('processes/:pid/kill')
  @HttpCode(200)
  killProcess(
    @Param('pid', ParseIntPipe) pid: number,
    @Body() body: KillProcessDto,
  ): Promise<{ pid: number; signaled: boolean }> {
    return this.systemService.killProcess(pid, body?.signal ?? 'SIGTERM');
  }
}
