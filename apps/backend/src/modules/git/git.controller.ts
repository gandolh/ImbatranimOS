import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import type { AppIdentity } from '../app-identity/app-identity.types';
import { CallingApp } from '../app-identity/calling-app';
import { GitService } from './git.service';
import {
  AmendBodyDto,
  ApplyPatchBodyDto,
  BranchBodyDto,
  BranchesQueryDto,
  CommitBodyDto,
  DiffQueryDto,
  ShowQueryDto,
  DiscardBodyDto,
  LogQueryDto,
  PathsBodyDto,
  RecentRepoBodyDto,
  StashPopBodyDto,
  StashPushBodyDto,
  StatusQueryDto,
} from './dto/git.dto';

/**
 * Git operations over a single home-FS repo. Every route is authenticated by
 * the global SessionGuard (no `@Public()` here); mutating routes also get
 * the guard's Origin/CSRF check. There is deliberately NO generic "run git"
 * route — only this fixed allowlist of subcommands exists.
 *
 * Every route that opens a repo runs as the calling app (`GitService.as`): an
 * app reaches a repo it was given, the user any.
 */
@Controller('git')
export class GitController {
  constructor(private readonly gitService: GitService) {}

  /** GET /api/git/status?root=&path= → parsed porcelain status */
  @Get('status')
  status(@CallingApp() who: AppIdentity | null, @Query() q: StatusQueryDto) {
    return this.gitService.as(who).status(q.root, q.path);
  }

  /** GET /api/git/log?root=&path=&limit= → recent commits */
  @Get('log')
  log(@CallingApp() who: AppIdentity | null, @Query() q: LogQueryDto) {
    return this.gitService.as(who).log(q.root, q.path, q.limit);
  }

  /** GET /api/git/diff?root=&path=&staged=&file= → unified diff (bounded) */
  @Get('diff')
  diff(@CallingApp() who: AppIdentity | null, @Query() q: DiffQueryDto) {
    return this.gitService.as(who).diff(q.root, q.path, q.staged, q.file);
  }

  /** POST /api/git/stage { root, path?, paths[] } → updated status */
  /**
   * GET /api/git/show?root=&path=&file= → { content, exists }
   *
   * One file's contents at HEAD. `show` is one more literal at one
   * more call site — still no generic "run git" route, and no `rev` parameter.
   */
  @Get('show')
  show(@CallingApp() who: AppIdentity | null, @Query() q: ShowQueryDto) {
    return this.gitService.as(who).showAtHead(q.root, q.path, q.file);
  }

  @Post('stage')
  stage(@CallingApp() who: AppIdentity | null, @Body() dto: PathsBodyDto) {
    return this.gitService.as(who).stage(dto.root, dto.paths, dto.path);
  }

  /** POST /api/git/unstage { root, path?, paths[] } → updated status */
  @Post('unstage')
  unstage(@CallingApp() who: AppIdentity | null, @Body() dto: PathsBodyDto) {
    return this.gitService.as(who).unstage(dto.root, dto.paths, dto.path);
  }

  /** POST /api/git/commit { root, path?, message } → commit output */
  @Post('commit')
  commit(@CallingApp() who: AppIdentity | null, @Body() dto: CommitBodyDto) {
    return this.gitService.as(who).commit(dto.root, dto.message, dto.path);
  }

  // -------------------------------------------------------------------------
  // Still no generic "run git" route — this is a longer allowlist,
  // not a looser one, and every entry names one subcommand.
  // -------------------------------------------------------------------------

  /** GET /api/git/branches?root=&path= → local branches, HEAD, and dirtiness */
  @Get('branches')
  branches(
    @CallingApp() who: AppIdentity | null,
    @Query() q: BranchesQueryDto,
  ) {
    return this.gitService.as(who).branches(q.root, q.path);
  }

  /** POST /api/git/branch { root, path?, name } → create a branch and switch */
  @Post('branch')
  createBranch(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: BranchBodyDto,
  ) {
    return this.gitService.as(who).createBranch(dto.root, dto.name, dto.path);
  }

  /** POST /api/git/switch { root, path?, name } → switch to an existing branch */
  @Post('switch')
  switchBranch(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: BranchBodyDto,
  ) {
    return this.gitService.as(who).switchBranch(dto.root, dto.name, dto.path);
  }

  /** POST /api/git/discard { root, path?, paths[] } → restore tracked files */
  @Post('discard')
  discard(@CallingApp() who: AppIdentity | null, @Body() dto: DiscardBodyDto) {
    return this.gitService.as(who).discard(dto.root, dto.paths, dto.path);
  }

  /** GET /api/git/stash?root=&path= → the stash entries */
  @Get('stash')
  stashList(
    @CallingApp() who: AppIdentity | null,
    @Query() q: BranchesQueryDto,
  ) {
    return this.gitService.as(who).stashList(q.root, q.path);
  }

  /** POST /api/git/stash { root, path?, message? } → stash everything */
  @Post('stash')
  stashPush(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: StashPushBodyDto,
  ) {
    return this.gitService.as(who).stashPush(dto.root, dto.message, dto.path);
  }

  /** POST /api/git/stash/pop { root, path?, index? } → restore a stash entry */
  @Post('stash/pop')
  stashPop(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: StashPopBodyDto,
  ) {
    return this.gitService.as(who).stashPop(dto.root, dto.index, dto.path);
  }

  /** GET /api/git/last-message?root=&path= → HEAD's message, to seed an amend */
  @Get('last-message')
  lastCommitMessage(
    @CallingApp() who: AppIdentity | null,
    @Query() q: BranchesQueryDto,
  ) {
    return this.gitService.as(who).lastCommitMessage(q.root, q.path);
  }

  /** POST /api/git/amend { root, path?, message } → replace the last commit */
  @Post('amend')
  amend(@CallingApp() who: AppIdentity | null, @Body() dto: AmendBodyDto) {
    return this.gitService.as(who).amend(dto.root, dto.message, dto.path);
  }

  /** GET /api/git/recents → repos opened before, most recent first */
  @Get('recents')
  recents(@CallingApp() who: AppIdentity | null) {
    return this.gitService.as(who).recentRepos();
  }

  /** POST /api/git/recents { root, path? } → record a repo as opened */
  @Post('recents')
  @HttpCode(204)
  remember(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: RecentRepoBodyDto,
  ) {
    return this.gitService.as(who).rememberRepo(dto.root, dto.path);
  }

  /** DELETE /api/git/recents { root, path? } → drop one from the list */
  @Delete('recents')
  @HttpCode(204)
  forget(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: RecentRepoBodyDto,
  ) {
    return this.gitService.as(who).forgetRepo(dto.root, dto.path);
  }

  /** POST /api/git/apply { root, path?, patch, reverse? } → stage/unstage a hunk */
  @Post('apply')
  applyPatch(
    @CallingApp() who: AppIdentity | null,
    @Body() dto: ApplyPatchBodyDto,
  ) {
    return this.gitService
      .as(who)
      .applyPatch(dto.root, dto.patch, dto.reverse, dto.path);
  }
}
