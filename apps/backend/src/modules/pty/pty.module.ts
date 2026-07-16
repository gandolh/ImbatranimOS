import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PtyGateway } from './pty.gateway';

/**
 * Terminal (Brief 11). A real login shell in a window, streamed over an
 * authenticated WebSocket. Imports AuthModule for SessionService (upgrade
 * auth + revocation). No controller — the transport is the `ws` upgrade
 * handler wired up in {@link PtyGateway}.
 */
@Module({
  imports: [AuthModule],
  providers: [PtyGateway],
})
export class PtyModule {}
