import * as fs from "fs/promises";
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Post, Query } from "@nestjs/common";
import type { AppIdentity } from "../app-identity/app-identity.types";
import { CallingApp, requireUser } from "../app-identity/calling-app";
import { FilesService } from "./files.service";
import type { ModeOp } from "../app-identity/mode-store.service";
import { RecentService, type RecentFile, type RecentKind } from "./recent.service";
import { RecordRecentDto, RemoveRecentQueryDto } from "./dto/recent.dto";

/**
 * OS-wide recent files. Session-authed by the global guard.
 * `DELETE /files/recent/all` is a separate route rather than "DELETE with no
 * params" so clearing everything can never be an accidental validation hole.
 *
 * Start reopens a recent file through the OS, which gives it to the app
 * again, so what an app may record is held to what it may read: an app can't
 * plant a file it was never given in the list for the owner to hand it later.
 * (Nor for itself: an app's own recent files are what it may reopen in a new
 * window, see `GrantsController`.) A folder is a recent too, recorded only
 * by an app that holds it whole: Git GUI's repositories.
 * An app sees and removes only its own entries; the whole list, and clearing
 * it, are the user's.
 */
@Controller("files/recent")
export class RecentController {
  constructor(
    private readonly recent: RecentService,
    private readonly files: FilesService,
  ) {}

  @Get()
  list(@CallingApp() who: AppIdentity | null): RecentFile[] {
    const all = this.recent.list();
    return who === null ? all : all.filter((r) => r.appId === who.appId);
  }

  @Post()
  @HttpCode(204)
  async record(@CallingApp() who: AppIdentity | null, @Body() dto: RecordRecentDto): Promise<void> {
    const kind = await this.kindAt(dto.root, dto.path);
    if (who === null) {
      this.recent.record(dto.root, dto.path, dto.appId, true, kind);
      return;
    }
    if (dto.appId !== who.appId) {
      throw new ForbiddenException(`${who.appId} may not record a recent file for ${dto.appId}`);
    }
    // What the app may do to it now is what a reopen gives later: a file it
    // may only read is recorded as such. A folder only by an app that holds
    // it whole, listing and writing in it, as a picked folder is given.
    const ops: ModeOp[] = kind === "folder" ? ["list", "write"] : ["read"];
    let key = "";
    try {
      for (const op of ops) {
        ({ key } = await this.files.check(who, op, dto.root, dto.path));
      }
    } catch (err) {
      // Recording one of its own again only moves it up: the app reopening
      // its recent in a new window, which doesn't hold it yet.
      if (this.recent.ownRecent(dto.root, dto.path, who.appId)?.kind === kind) {
        this.recent.record(dto.root, dto.path, dto.appId, undefined, kind);
        return;
      }
      throw err;
    }
    const writable = kind === "folder" || this.files.can(who, "write", key) !== null;
    this.recent.record(dto.root, dto.path, dto.appId, writable, kind);
  }

  /** A folder when one is there now; anything else, a missing path included, is a file. */
  private async kindAt(root: string, path: string): Promise<RecentKind> {
    const stat = await this.files
      .resolveSafe(root, path)
      .then(({ abs }) => fs.stat(abs))
      .catch(() => null);
    return stat?.isDirectory() ? "folder" : "file";
  }

  @Delete("all")
  @HttpCode(204)
  clear(@CallingApp() who: AppIdentity | null): void {
    requireUser(who, "clear the recent files");
    this.recent.clear();
  }

  @Delete()
  @HttpCode(204)
  remove(@CallingApp() who: AppIdentity | null, @Query() query: RemoveRecentQueryDto): void {
    this.recent.remove(query.root, query.path, who?.appId);
  }
}
