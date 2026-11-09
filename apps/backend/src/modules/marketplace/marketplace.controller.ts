import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { request, type IncomingHttpHeaders } from 'http';
import { extname } from 'path';
import { pipeline } from 'stream';

import { LeaseDto } from './dto/lease.dto';
import { InspectUrlDto, InstallUrlDto } from './dto/url.dto';
import { LEASE_MS, MarketplaceServers } from './marketplace-servers.service';
import { MarketplaceUrlApps } from './marketplace-url.service';
import { MarketplaceService } from './marketplace.service';

/** What an app's build may serve, by extension. Anything else is a download. */
const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.html': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
};

/** Request headers an app's server never sees: the desktop's credentials, and hop-by-hop. */
const DROPPED_REQUEST_HEADERS = new Set([
  'cookie',
  'authorization',
  'host',
  'connection',
  'keep-alive',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Response headers an app's server may not set on the desktop's origin: the
 * hop-by-hop ones, cookies, and every header the desktop's own policy sets
 * (security-headers.ts), so a proxied answer keeps the desktop's isolation,
 * framing and CSP. Clear-Site-Data would wipe the desktop's session and
 * storage; Service-Worker-Allowed and HSTS reach past the app's path.
 */
const DROPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-security-policy',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'clear-site-data',
  'service-worker-allowed',
  'strict-transport-security',
]);

/**
 * The marketplace. Every route sits behind the global guard:
 * installing runs a build, and the served files and the app servers are the
 * owner's.
 *
 * The native routes' `:id` (install, uninstall, log, built files, lease,
 * server) is a descriptor's id, not an app's: a suite's apps
 * share one build, one served directory and one server. For a version 1
 * descriptor and a URL app the two ids are the same.
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly servers: MarketplaceServers,
    private readonly urlApps: MarketplaceUrlApps,
  ) {}

  /** GET /api/marketplace → the catalog, with what is installed and building. */
  @Get()
  list() {
    return this.marketplace.list();
  }

  /** POST /api/marketplace/apps/:id/install → 202; the build runs in the background. */
  @Post('apps/:id/install')
  @HttpCode(HttpStatus.ACCEPTED)
  install(@Param('id') id: string) {
    return this.marketplace.install(id);
  }

  /**
   * DELETE /api/marketplace/apps/:id → stop its server, delete its builds and
   * its apps' caches. `?removeData=1` also deletes their settings, data and
   * state, which otherwise stay for a reinstall.
   */
  @Delete('apps/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async uninstall(
    @Param('id') id: string,
    @Query('removeData') removeData?: string,
  ): Promise<void> {
    await this.marketplace.uninstall(id, { removeData: removeData === '1' });
  }

  /** GET /api/marketplace/apps/:id/log → the last build's log, and the server's output. */
  @Get('apps/:id/log')
  async log(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const text = await this.marketplace.log(id);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(text);
  }

  // ── apps from a URL ──────────────────────────────────────────

  /**
   * POST /api/marketplace/url/inspect { url } → the consent card's facts and a
   * `pending` id. Clones the repository and holds the clone for 15 minutes.
   */
  @Post('url/inspect')
  @HttpCode(HttpStatus.OK)
  inspect(@Body() dto: InspectUrlDto) {
    return this.urlApps.inspect(dto.url);
  }

  /**
   * POST /api/marketplace/url/install { pending, trust? } → the app's listing
   * entry, its build queued. 403 for an app that is not verified at the
   * checked commit, unless `trust`.
   */
  @Post('url/install')
  @HttpCode(HttpStatus.OK)
  installFromUrl(@Body() dto: InstallUrlDto) {
    return this.urlApps.install(dto.pending, dto.trust === true);
  }

  /** DELETE /api/marketplace/url/pending/:pending — the owner said Cancel. */
  @Delete('url/pending/:pending')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelPending(@Param('pending') pending: string): Promise<void> {
    await this.urlApps.cancel(pending);
  }

  // ── the native runtime's files and servers ───────────────────

  /**
   * GET /api/marketplace/apps/:id/b/:buildId/<file> → a file of the live
   * build's output directory, shared by every app of the descriptor. The
   * build id is in the path, so a file never changes under its URL and may be
   * cached for good.
   */
  @Get('apps/:id/b/:buildId/*path')
  async file(
    @Param('id') id: string,
    @Param('buildId') buildId: string,
    @Param('path') path: string[] | string,
    @Res() res: Response,
  ): Promise<void> {
    const segments = Array.isArray(path) ? path : path.split('/');
    const abs = await this.marketplace.servedFile(id, buildId, segments);
    res.setHeader(
      'Content-Type',
      CONTENT_TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream',
    );
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    pipeline(createReadStream(abs), res, () => undefined);
  }

  /**
   * POST /api/marketplace/apps/:id/lease { lease? } → { lease, renewMs }:
   * start the descriptor's server if needed, wait until it answers, and hold
   * it while the window is open. Each window of any of its apps holds its
   * own lease on the one server. The window renews before `renewMs` and
   * releases on close; a lease not renewed lapses, so a closed tab does not
   * keep a server up.
   */
  @Post('apps/:id/lease')
  async lease(@Param('id') id: string, @Body() dto: LeaseDto) {
    this.marketplace.refuseUnlessNative(id);
    const { lease } = await this.servers.acquire(
      id,
      () => this.marketplace.serverSpec(id),
      dto.lease,
    );
    return { lease, renewMs: Math.floor(LEASE_MS / 2) };
  }

  /** DELETE /api/marketplace/apps/:id/lease/:lease — the window closed. */
  @Delete('apps/:id/lease/:lease')
  @HttpCode(HttpStatus.NO_CONTENT)
  release(@Param('id') id: string, @Param('lease') lease: string): void {
    this.marketplace.refuseUnlessNative(id);
    this.servers.release(id, lease);
  }

  /**
   * GET|HEAD /api/marketplace/apps/:id/server/<path> → the app's server. Reads
   * only: a game's client talks to its sim over the WebSocket (see
   * MarketplaceWsProxy), and its HTTP side is for health and static data.
   */
  @Get('apps/:id/server/*path')
  @Head('apps/:id/server/*path')
  proxy(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    this.marketplace.refuseUnlessNative(id);
    const port = this.servers.portFor(id);
    if (port === null) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: 503,
        message: 'The app server is not running',
      });
      return;
    }
    const prefix = `/api/marketplace/apps/${id}/server`;
    const url = req.originalUrl;
    const path = url.startsWith(prefix) ? url.slice(prefix.length) || '/' : '/';
    const headers: IncomingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!DROPPED_REQUEST_HEADERS.has(name)) headers[name] = value;
    }
    const upstream = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: req.method,
        headers,
        timeout: 30_000,
      },
      (answer) => {
        res.status(answer.statusCode ?? 502);
        for (const [name, value] of Object.entries(answer.headers)) {
          if (value !== undefined && !DROPPED_RESPONSE_HEADERS.has(name)) {
            res.setHeader(name, value);
          }
        }
        pipeline(answer, res, () => undefined);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.status(HttpStatus.BAD_GATEWAY).json({
          statusCode: 502,
          message: 'The app server did not answer',
        });
      } else {
        res.destroy();
      }
    });
    upstream.end();
  }
}
