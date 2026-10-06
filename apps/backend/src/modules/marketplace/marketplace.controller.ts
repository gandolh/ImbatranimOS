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
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { request, type IncomingHttpHeaders } from 'http';
import { extname } from 'path';
import { pipeline } from 'stream';

import { LeaseDto } from './dto/lease.dto';
import { LEASE_MS, MarketplaceServers } from './marketplace-servers.service';
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

/** Response headers an app's server may not set on the desktop's origin. */
const DROPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-security-policy',
  'access-control-allow-origin',
  'access-control-allow-credentials',
]);

/**
 * The marketplace (brief 120). Every route sits behind the global guard (no
 * `@Public()`): installing runs a build, and the served files and the app
 * servers are the owner's.
 */
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly servers: MarketplaceServers,
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

  /** DELETE /api/marketplace/apps/:id → stop its server, delete its builds. */
  @Delete('apps/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async uninstall(@Param('id') id: string): Promise<void> {
    await this.marketplace.uninstall(id);
  }

  /** GET /api/marketplace/apps/:id/log → the last build's log, and the server's output. */
  @Get('apps/:id/log')
  async log(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const text = await this.marketplace.log(id);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(text);
  }

  /**
   * GET /api/marketplace/apps/:id/b/:buildId/<file> → a file of the live
   * build's output directory. The build id is in the path, so a file never
   * changes under its URL and may be cached for good.
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
   * start the app's server if needed, wait until it answers, and hold it while
   * the window is open. The window renews before `renewMs` and releases on
   * close; a lease not renewed lapses, so a closed tab does not keep a server
   * up.
   */
  @Post('apps/:id/lease')
  async lease(@Param('id') id: string, @Body() dto: LeaseDto) {
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
