import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GitService } from './git.service';
import {
  CommitBodyDto,
  DiffQueryDto,
  LogQueryDto,
  PathsBodyDto,
  StatusQueryDto,
} from './dto/git.dto';

/**
 * Git operations over a single home-FS repo. Every route is authenticated by
 * the global SessionAuthGuard (no `@Public()` here); mutating routes also get
 * the guard's Origin/CSRF check. There is deliberately NO generic "run git"
 * route — only this fixed allowlist of subcommands exists.
 */
@Controller('git')
export class GitController {
  constructor(private readonly gitService: GitService) {}

  /** GET /api/git/status?root=&path= → parsed porcelain status */
  @Get('status')
  status(@Query() q: StatusQueryDto) {
    return this.gitService.status(q.root, q.path);
  }

  /** GET /api/git/log?root=&path=&limit= → recent commits */
  @Get('log')
  log(@Query() q: LogQueryDto) {
    return this.gitService.log(q.root, q.path, q.limit);
  }

  /** GET /api/git/diff?root=&path=&staged=&file= → unified diff (bounded) */
  @Get('diff')
  diff(@Query() q: DiffQueryDto) {
    return this.gitService.diff(q.root, q.path, q.staged, q.file);
  }

  /** POST /api/git/stage { root, path?, paths[] } → updated status */
  @Post('stage')
  stage(@Body() dto: PathsBodyDto) {
    return this.gitService.stage(dto.root, dto.paths, dto.path);
  }

  /** POST /api/git/unstage { root, path?, paths[] } → updated status */
  @Post('unstage')
  unstage(@Body() dto: PathsBodyDto) {
    return this.gitService.unstage(dto.root, dto.paths, dto.path);
  }

  /** POST /api/git/commit { root, path?, message } → commit output */
  @Post('commit')
  commit(@Body() dto: CommitBodyDto) {
    return this.gitService.commit(dto.root, dto.message, dto.path);
  }
}
