import { Module } from '@nestjs/common';
import { PtyGateway } from './pty.gateway';

/**
 * Terminal (Brief 11). A real login shell in a window, streamed over an
 * authenticated WebSocket. `WardService` comes from the global WardModule (upgrade
 * auth + revocation). No controller — the transport is the `ws` upgrade
 * handler wired up in {@link PtyGateway}.
 */
@Module({
  providers: [PtyGateway],
})
export class PtyModule {}
