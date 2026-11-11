import { Module } from "@nestjs/common";
import { WaylandModule } from "../wayland/wayland.module";
import { PtyGateway } from "./pty.gateway";

/**
 * Terminal. A real login shell in a window, streamed over an
 * authenticated WebSocket. `LocalIdentityService` comes from the global IdentityModule (upgrade
 * auth + revocation). No controller — the transport is the `ws` upgrade
 * handler wired up in {@link PtyGateway}.
 */
@Module({
  // A shell gets the X display of its tab's desktop session.
  imports: [WaylandModule],
  providers: [PtyGateway],
})
export class PtyModule {}
