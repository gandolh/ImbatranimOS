import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { createWardClient, type WardClient } from './ward.client';
import type { WardCaller } from './ward.types';

/**
 * The app's one Ward client, as an injectable.
 *
 * ## Why this is a provider rather than a module-level singleton
 *
 * The client owns two caches — the JWKS document and the 30-second
 * introspection answers — so there must be exactly one of it per process, and
 * something has to decide when it is built. Nest's container is already that
 * something, and going through it means the e2e suites can override this
 * provider to decide who is signed in without a network, a signing key, or a
 * real Ward.
 *
 * It is built in `onModuleInit` rather than in the constructor so that a
 * missing `WARD_APP_KEY` fails during bootstrap with a message naming the
 * variable, rather than on the first request that happens to need it.
 *
 * ## Both transports go through here
 *
 * REST (`WardAuthGuard`) and WebSocket upgrades (`ws-auth.ts`) call the same
 * `authenticate`, on the same cookie header. That was true of the session
 * service this replaces and is the property most worth preserving: two
 * definitions of "is this a valid session" is how a WS endpoint ends up
 * honouring a session REST has already refused.
 */
@Injectable()
export class WardService implements OnModuleInit {
  private readonly logger = new Logger(WardService.name);
  private client!: WardClient;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const publicOrigin = this.config
      .get('WARD_PUBLIC_ORIGIN', { infer: true })
      .replace(/\/+$/, '');
    const apiBasePath = this.config.get('WARD_API_BASE_PATH', { infer: true });
    const appKey = this.config.get('WARD_APP_KEY', { infer: true });

    this.client = createWardClient({ publicOrigin, apiBasePath, appKey });
    this.logger.log(
      `Ward identity: ${publicOrigin}${apiBasePath} (app key ends …${appKey.slice(-4)})`,
    );
  }

  /**
   * Resolve a raw `Cookie` header to a live session, or throw.
   *
   * The last four characters of the key are logged at boot and nothing more —
   * enough to tell two keys apart during a rotation, not enough to be one.
   */
  authenticate(
    cookieHeader: string | string[] | undefined,
  ): Promise<WardCaller> {
    return this.client.authenticate(cookieHeader);
  }

  /** Test seam: swap the client for a fake without touching the container. */
  useClient(client: WardClient): void {
    this.client = client;
  }
}
