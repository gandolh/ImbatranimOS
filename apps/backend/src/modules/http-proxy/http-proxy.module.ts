import { Module } from '@nestjs/common';
import { HttpProxyController } from './http-proxy.controller';
import { HttpProxyService } from './http-proxy.service';

@Module({
  controllers: [HttpProxyController],
  providers: [HttpProxyService],
})
export class HttpProxyModule {}
