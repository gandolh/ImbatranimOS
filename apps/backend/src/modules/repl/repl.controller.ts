import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ReplService } from './repl.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';
import { SendInputDto } from './dto/send-input.dto';
import { CreateSessionDto } from './dto/create-session.dto';

@Controller('repl')
export class ReplController {
  constructor(private readonly replService: ReplService) {}

  @Get('configs')
  findAllConfigs() {
    return this.replService.findAllConfigs();
  }

  @Post('configs')
  createConfig(@Body() dto: CreateConfigDto) {
    return this.replService.createConfig(dto);
  }

  @Patch('configs/:id')
  updateConfig(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConfigDto) {
    return this.replService.updateConfig(id, dto);
  }

  @Delete('configs/:id')
  @HttpCode(204)
  deleteConfig(@Param('id', ParseIntPipe) id: number): void {
    this.replService.deleteConfig(id);
  }

  @Post('sessions')
  createSession(@Body() dto: CreateSessionDto) {
    return this.replService.createSession(dto.configId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  deleteSession(@Param('id') id: string): void {
    this.replService.deleteSession(id);
  }

  @Post('sessions/:id/input')
  sendInput(@Param('id') id: string, @Body() dto: SendInputDto) {
    return this.replService.sendInput(id, dto.command);
  }
}
