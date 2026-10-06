import { Global, Injectable, Module } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

/** A WebSocket endpoint on the desktop's port, other than the terminal's. */
export interface UpgradeRoute {
  /** True when this route owns the upgrade's path (query string already cut off). */
  matches(path: string): boolean;
  /** Take the socket: answer the handshake, or refuse it and destroy the socket. */
  handle(req: IncomingMessage, socket: Duplex, head: Buffer): void;
}

/**
 * The WebSocket endpoints that share the desktop's HTTP server.
 *
 * Node hands every upgrade to every `'upgrade'` listener, and a listener has
 * to refuse what it does not own or the socket hangs. Two listeners would each
 * refuse the other's paths, so there is one, in `PtyGateway`, and other
 * endpoints register here for it to dispatch to (the marketplace's service
 * apps, brief 120).
 */
@Injectable()
export class UpgradeRoutes {
  private readonly routes = new Set<UpgradeRoute>();

  register(route: UpgradeRoute): () => void {
    this.routes.add(route);
    return () => this.routes.delete(route);
  }

  find(url: string | undefined): UpgradeRoute | undefined {
    if (!url) return undefined;
    const path = url.split('?', 1)[0];
    for (const route of this.routes) {
      if (route.matches(path)) return route;
    }
    return undefined;
  }
}

@Global()
@Module({ providers: [UpgradeRoutes], exports: [UpgradeRoutes] })
export class UpgradeRoutesModule {}
