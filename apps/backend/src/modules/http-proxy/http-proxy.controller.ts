import { Body, Controller, Post } from '@nestjs/common';
import { HttpProxyService } from './http-proxy.service';
import {
  HttpProxyRequestDto,
  type HttpProxyResponse,
} from './dto/http-proxy.dto';

/**
 * REST-client backend proxy. Every route here is authenticated by the global
 * SessionAuthGuard (owner-only) — there is deliberately NO `@Public()`. That
 * owner-auth is the PRIMARY SSRF control; the service enforces the rest.
 */
@Controller('http')
export class HttpProxyController {
  constructor(private readonly httpProxy: HttpProxyService) {}

  /** POST /api/http/request — relay the outbound request, return base64 body. */
  @Post('request')
  request(@Body() dto: HttpProxyRequestDto): Promise<HttpProxyResponse> {
    return this.httpProxy.request(dto);
  }
}
