import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';

import { BrowserProfileService } from './browser-profile.service';
import { BrowserProxyServer } from './browser-proxy.server';
import { PutBrowserProfileDto } from './dto/browser-profile.dto';

/**
 * The Browser app's routes on the desktop's API (brief 50). Authed by the
 * global guard; no `@Public()`.
 *
 * They live on the desktop's origin, not the proxy's, on purpose: the profile
 * holds every site's sign-in, and the proxy origin is where untrusted pages
 * run. The desktop reads it here and hands it to the proxy frame itself.
 */
@Controller('browser')
export class BrowserController {
  constructor(
    private readonly proxy: BrowserProxyServer,
    private readonly profile: BrowserProfileService,
  ) {}

  /** GET /api/browser/config → where the proxy origin is, or null when the Browser is off. */
  @Get('config')
  config(): { origin: string | null } {
    return { origin: this.proxy.origin };
  }

  /** GET /api/browser/profile → { jar, updatedAt } (both null when there is none) */
  @Get('profile')
  read() {
    return this.profile.read();
  }

  /** PUT /api/browser/profile { jar } */
  @Put('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  write(@Body() dto: PutBrowserProfileDto): void {
    this.profile.write(dto.jar);
  }

  /** DELETE /api/browser/profile — sign out of every site. */
  @Delete('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(): void {
    this.profile.clear();
  }
}
