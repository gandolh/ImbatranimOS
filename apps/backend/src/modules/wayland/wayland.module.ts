import { Module } from '@nestjs/common';
import { WaylandGateway } from './wayland.gateway';
import { WaylandHostService } from './wayland-host.service';

/**
 * Linux apps' windows. The Wayland host (apps/wayland-host) is the display
 * they connect to; this module starts it, relays each desktop session's
 * windows to its tab over `/api/wayland`, and keeps the sign-in checks.
 * `LocalIdentityService` and `UpgradeRoutes` come from global modules.
 */
@Module({
  providers: [WaylandHostService, WaylandGateway],
})
export class WaylandModule {}
