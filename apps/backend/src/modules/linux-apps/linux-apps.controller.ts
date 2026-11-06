import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import {
  InstallDto,
  MoveDto,
  RemoveDto,
  SessionDto,
} from './dto/linux-apps.dto';
import { LinuxAppUpdatesService } from './linux-app-updates.service';
import { LinuxAppsService, parseLanguages } from './linux-apps.service';

/**
 * `/api/linux-apps`: the Linux apps pane and Start's Linux entries. Behind
 * the sign-in like every route; the changes and launches also need the
 * calling tab's live desktop session.
 */
@Controller('linux-apps')
export class LinuxAppsController {
  constructor(
    private readonly apps: LinuxAppsService,
    private readonly updates: LinuxAppUpdatesService,
  ) {}

  /** GET /api/linux-apps → whether the pane can work, and the index's state. */
  @Get()
  status() {
    return this.apps.status();
  }

  /** GET /api/linux-apps/search?q=firefox → up to 50 packages. */
  @Get('search')
  search(@Query('q') q?: string) {
    return this.apps.search(typeof q === 'string' ? q : '');
  }

  /** GET /api/linux-apps/installed → the profile's apps. */
  @Get('installed')
  installed() {
    return this.apps.installed();
  }

  /**
   * GET /api/linux-apps/updates → the pin, the one Go back returns to, and
   * what the last check found, with the installed apps' versions on each.
   */
  @Get('updates')
  updatesStatus() {
    return this.updates.status();
  }

  /**
   * POST /api/linux-apps/updates/check → asks NixOS's channels, as a job.
   * It changes no app, so any signed-in tab may ask.
   */
  @Post('updates/check')
  @HttpCode(HttpStatus.ACCEPTED)
  checkUpdates() {
    return this.updates.check();
  }

  /** POST /api/linux-apps/updates/move { kind, commit, session } → Update or Upgrade, as a job. */
  @Post('updates/move')
  @HttpCode(HttpStatus.ACCEPTED)
  moveTo(@Body() body: MoveDto) {
    return this.updates.move(body.kind, body.commit, body.session);
  }

  /** POST /api/linux-apps/updates/go-back { session } → the previous pin and its apps, as a job. */
  @Post('updates/go-back')
  @HttpCode(HttpStatus.ACCEPTED)
  goBack(@Body() body: SessionDto) {
    return this.updates.goBack(body.session);
  }

  /** GET /api/linux-apps/job → the last install, removal, clean-up or update, with its log. */
  @Get('job')
  job() {
    return { job: this.apps.getJob() };
  }

  /** GET /api/linux-apps/store → the store's size. */
  @Get('store')
  async store() {
    return { bytes: await this.apps.storeBytes() };
  }

  @Post('install')
  @HttpCode(HttpStatus.ACCEPTED)
  install(@Body() body: InstallDto) {
    return this.apps.install(body.attr, body.session);
  }

  @Post('remove')
  @HttpCode(HttpStatus.ACCEPTED)
  remove(@Body() body: RemoveDto) {
    return this.apps.remove(body.name, body.session);
  }

  /** POST /api/linux-apps/free-space → `nix-collect-garbage -d`, as a job. */
  @Post('free-space')
  @HttpCode(HttpStatus.ACCEPTED)
  freeSpace(@Body() body: SessionDto) {
    return this.apps.freeSpace(body.session);
  }

  /**
   * GET /api/linux-apps/launchers?languages=ro-RO,ro → Start's Linux entries,
   * named in the first of the browser's languages each one has.
   */
  @Get('launchers')
  launchers(@Query('languages') languages?: string) {
    return this.apps.launchers(parseLanguages(languages));
  }

  /**
   * GET /api/linux-apps/launchers/:id/icon → the entry's icon. An SVG gets a
   * policy that runs nothing, so opening it by its URL is as harmless as
   * showing it in an <img>.
   */
  @Get('launchers/:id/icon')
  async icon(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { path, type } = await this.apps.icon(id);
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    createReadStream(path)
      .on('error', () => res.status(404).end())
      .pipe(res);
  }

  @Post('launchers/:id/launch')
  launch(@Param('id') id: string, @Body() body: SessionDto) {
    return this.apps.launch(id, body.session);
  }

  /**
   * POST /api/linux-apps/launchers/:id/actions/:action/launch { session } →
   * one of the entry's desktop actions (Firefox's New Window), started the
   * way the entry is, from the tab that holds the session.
   */
  @Post('launchers/:id/actions/:action/launch')
  launchAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: SessionDto,
  ) {
    return this.apps.launch(id, body.session, action);
  }
}
