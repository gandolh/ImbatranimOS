import { Module } from '@nestjs/common';
import { WaylandModule } from '../wayland/wayland.module';
import { LinuxAppsController } from './linux-apps.controller';
import { LinuxAppsService } from './linux-apps.service';

/**
 * Installing Linux apps from Nix, and their Start entries. The Wayland
 * module says which desktop sessions are live: launches go into one, and
 * changes come only from one.
 */
@Module({
  imports: [WaylandModule],
  controllers: [LinuxAppsController],
  providers: [LinuxAppsService],
  exports: [LinuxAppsService],
})
export class LinuxAppsModule {}
