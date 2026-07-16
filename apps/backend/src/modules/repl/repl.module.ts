import { Module } from '@nestjs/common';
import { ReplController } from './repl.controller';
import { ReplService } from './repl.service';

@Module({
  controllers: [ReplController],
  providers: [ReplService],
})
export class ReplModule {}
