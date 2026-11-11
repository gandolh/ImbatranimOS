import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";

import { UserOnlyGuard } from "../app-identity/calling-app";
import { SetAsideService, type SetAsideStatus } from "./set-aside.service";

export class DownloadSetAsideDto {
  /** The file root the Save dialog gave (`home`, `notes`). */
  @IsString()
  @MaxLength(32)
  root!: string;

  @IsString()
  @MaxLength(4096)
  path!: string;
}

/**
 * `/api/system/old-data`: the older data the data moves set aside, for the
 * desktop's sign-in notice and Settings. The user's alone, like backups: an
 * app token gets 403.
 *
 * - `GET` → which apps have older data, its sets, and whether to ask;
 * - `POST download` `{ root, path }` → `{ path, files }`, the `.tar.gz`
 *   written at the path the Save dialog gave; 404 when nothing is set aside;
 * - `DELETE` → `{ dropped }`, every set-aside table dropped.
 */
@Controller("system/old-data")
@UseGuards(UserOnlyGuard)
export class SetAsideController {
  constructor(private readonly setAside: SetAsideService) {}

  @Get()
  status(): Promise<SetAsideStatus> {
    return this.setAside.status();
  }

  @Post("download")
  download(@Body() dto: DownloadSetAsideDto): Promise<{ path: string; files: number }> {
    return this.setAside.download(dto.root, dto.path);
  }

  @Delete()
  cleanOut(): Promise<{ dropped: string[] }> {
    return this.setAside.cleanOut();
  }
}
