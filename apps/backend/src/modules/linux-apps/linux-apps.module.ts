import { Module } from "@nestjs/common";
import { PrefsModule } from "../prefs/prefs.module";
import { WaylandModule } from "../wayland/wayland.module";
import { LinuxAppsController } from "./linux-apps.controller";
import { LinuxAppUpdatesService } from "./linux-app-updates.service";
import { LinuxAppsService } from "./linux-apps.service";
import { SessionBusService } from "./session-bus.service";

/**
 * Installing Linux apps from Nix, and their Start entries. The Wayland
 * module says which desktop sessions are live: launches go into one, and
 * changes come only from one.
 */
@Module({
  imports: [WaylandModule, PrefsModule],
  controllers: [LinuxAppsController],
  providers: [LinuxAppsService, LinuxAppUpdatesService, SessionBusService],
  exports: [LinuxAppsService],
})
export class LinuxAppsModule {}
