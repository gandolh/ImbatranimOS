import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, posix, relative, resolve, sep } from 'path';

import type { Env } from '../../config/env.schema';
import { DbService } from '../../db/db.service';
import { loadCatalog, type Catalog, type Descriptor } from './catalog';
import {
  MarketplaceServers,
  type ServerSpec,
} from './marketplace-servers.service';
import { runStep } from './run-step';

/** How long a clone may take. A shallow fetch of one commit. */
const FETCH_TIMEOUT_MS = 5 * 60_000;
/** How long `build.install` and `build.command` may each take. */
const BUILD_TIMEOUT_MS = 15 * 60_000;
/** The most a build may leave in the directory it serves from. */
export const MAX_SERVED_BYTES = 256 * 1024 * 1024;

/**
 * Where installed apps live: beside the database, so on the home volume
 * (`~/.imbatranim/apps`) in the image. Each build is its own directory,
 * `<id>@<buildId>`; the database row names the live one. The backup leaves the
 * whole directory out: it is rebuilt from the catalog.
 */
export function marketplaceAppsDir(dbPath: string): string {
  if (dbPath === ':memory:') {
    return join(tmpdir(), `imbatranim-apps-${process.pid}`);
  }
  return join(dirname(dbPath), 'apps');
}

export type JobState = 'queued' | 'fetching' | 'building' | 'failed';

export interface Job {
  state: JobState;
  reason?: string;
}

interface InstalledRow {
  id: string;
  ref: string;
  build_id: string;
  /** The app's directory inside the clone (`source.subdir`), POSIX, '' for the top. */
  root: string;
  /** `build.entry`, relative to `root`. */
  entry: string;
  installed_at: number;
}

/** What the Marketplace pane and the desktop's registry read. */
export interface MarketplaceApp {
  id: string;
  name: string;
  description: string;
  meta: string[];
  type: Descriptor['type'];
  icon: string;
  window: Descriptor['window'];
  capabilities: Descriptor['capabilities'];
  minSystemVersion: number;
  /** The commit the catalog pins now. */
  ref: string;
  installed: {
    ref: string;
    buildId: string;
    installedAt: number;
    /** What the desktop imports, relative to the API's base (`/api`). */
    entryPath: string;
    /** The build's directory is gone (a restored backup leaves it out): reinstall. */
    missing: boolean;
  } | null;
  job: Job | null;
  server: ReturnType<MarketplaceServers['status']>;
}

/** The pieces of the environment a build or an app's server gets. Nothing else. */
const PASSED_THROUGH = ['PATH', 'LANG', 'LC_ALL', 'TZ'] as const;

/**
 * The marketplace (brief 120): installs the apps the in-repo catalog
 * describes, by cloning each at its pinned commit and building it in the live
 * container.
 *
 * What keeps this from being "run anything from the internet" is the catalog:
 * an id that is not described there cannot be installed or served, and the
 * descriptor fixes the repository, the commit and the commands. A build still
 * runs that repository's code (its npm scripts) as this user, which is the
 * weight the brief accepted; it does so with a minimal environment, its own
 * HOME and npm cache (so no secret of the backend's and no `~/.npmrc` token
 * reaches it), a deadline, and its own process group.
 */
@Injectable()
export class MarketplaceService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceService.name);
  private readonly jobs = new Map<string, Job>();
  /** Builds run one at a time: two at once is twice the memory and CPU. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService<Env, true>,
    private readonly servers: MarketplaceServers,
  ) {}

  async onModuleInit(): Promise<void> {
    const { apps, problems } = this.catalog();
    for (const p of problems) {
      this.logger.warn(`Skipped marketplace/${p.file}: ${p.problem}`);
    }
    if (apps.size > 0) {
      this.logger.log(`Marketplace catalog: ${[...apps.keys()].join(', ')}`);
    }
    await this.sweepStaleBuilds();
  }

  appsDir(): string {
    return marketplaceAppsDir(this.dbs.path());
  }

  /**
   * Read on every call rather than once: it is a handful of small files, and
   * in development a descriptor being edited takes effect without a restart.
   */
  catalog(): Catalog {
    return loadCatalog(resolve(this.config.get('MARKETPLACE_DIR')), {
      allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS'),
    });
  }

  private row(id: string): InstalledRow | undefined {
    return this.dbs.db
      .prepare('SELECT * FROM marketplace_apps WHERE id = ?')
      .get(id) as InstalledRow | undefined;
  }

  private rows(): InstalledRow[] {
    return this.dbs.db
      .prepare('SELECT * FROM marketplace_apps ORDER BY id')
      .all() as InstalledRow[];
  }

  private buildDir(id: string, buildId: string): string {
    return join(this.appsDir(), `${id}@${buildId}`);
  }

  private logPath(id: string): string {
    return join(this.appsDir(), `${id}.log`);
  }

  // ── reading ──────────────────────────────────────────────────────────────

  async list(): Promise<{
    apps: MarketplaceApp[];
    problems: Catalog['problems'];
  }> {
    const { apps, problems } = this.catalog();
    const rows = new Map(this.rows().map((r) => [r.id, r]));
    const out: MarketplaceApp[] = [];
    for (const d of apps.values()) {
      const row = rows.get(d.id);
      out.push({
        id: d.id,
        name: d.name,
        description: d.description,
        meta: d.meta,
        type: d.type,
        icon: d.icon,
        window: d.window,
        capabilities: d.capabilities,
        minSystemVersion: d.minSystemVersion,
        ref: d.source.ref,
        installed: row
          ? {
              ref: row.ref,
              buildId: row.build_id,
              installedAt: row.installed_at,
              entryPath: `marketplace/apps/${d.id}/b/${row.build_id}/${posix.basename(row.entry)}`,
              missing: !(await exists(
                join(this.buildDir(d.id, row.build_id), row.root, row.entry),
              )),
            }
          : null,
        job: this.jobs.get(d.id) ?? null,
        server: this.servers.status(d.id),
      });
    }
    // An app installed from a descriptor that has since left the catalog is
    // no longer runnable, but its files are still on disk: list it, so it can
    // be uninstalled.
    for (const row of rows.values()) {
      if (apps.has(row.id)) continue;
      problems.push({
        file: `${row.id}.json`,
        problem: 'installed, but no longer in the catalog: uninstall it',
      });
    }
    return { apps: out, problems };
  }

  async log(id: string): Promise<string> {
    if (!isAppId(id)) throw new NotFoundException();
    const build = await fs.readFile(this.logPath(id), 'utf8').catch(() => '');
    const server = this.servers.output(id);
    return server ? `${build}\n── server ──\n${server}` : build;
  }

  /**
   * The file a request for an installed app's build names, as a real path
   * inside the directory the entry lives in. Anything else is a 404: an id
   * outside the catalog, a build that is not the live one, a path that climbs
   * out or reaches through a symlink, a dotfile.
   */
  async servedFile(
    id: string,
    buildId: string,
    segments: string[],
  ): Promise<string> {
    const d = this.catalog().apps.get(id);
    const row = d ? this.row(id) : undefined;
    if (!row || row.build_id !== buildId) throw new NotFoundException();
    if (
      segments.length === 0 ||
      segments.some(
        (s) =>
          s === '' ||
          s.startsWith('.') ||
          s.includes('/') ||
          s.includes('\\') ||
          s.includes('\0'),
      )
    ) {
      throw new NotFoundException();
    }
    const servedRoot = join(
      this.buildDir(id, buildId),
      row.root,
      posix.dirname(row.entry),
    );
    try {
      const realRoot = await fs.realpath(servedRoot);
      const abs = await fs.realpath(join(servedRoot, ...segments));
      if (!isInside(realRoot, abs)) throw new Error('outside');
      if (!(await fs.stat(abs)).isFile()) throw new Error('not a file');
      return abs;
    } catch {
      throw new NotFoundException();
    }
  }

  /**
   * What the supervisor needs to start an installed service app's server, or
   * a 404 when there is no such app, a 409 when it is not a service or not
   * built.
   */
  serverSpec(id: string): ServerSpec {
    const d = this.catalog().apps.get(id);
    const row = d ? this.row(id) : undefined;
    if (!d || !row) throw new NotFoundException();
    if (!d.server) throw new ConflictException(`${d.name} has no server`);
    if (this.jobs.has(id) && this.jobs.get(id)?.state !== 'failed') {
      throw new ConflictException(`${d.name} is being installed`);
    }
    const cwd = join(this.buildDir(id, row.build_id), row.root);
    return {
      command: d.server.command,
      cwd,
      env: this.childEnv({ NODE_ENV: 'production' }),
      health: d.server.health,
      portEnv: d.server.portEnv,
    };
  }

  // ── installing ───────────────────────────────────────────────────────────

  /**
   * Queue an install (or an update, or a reinstall: the same thing, a fresh
   * build at the catalog's ref). Answers at once; the pane polls `list`.
   */
  install(id: string): Job {
    const d = this.catalog().apps.get(id);
    if (!d) throw new NotFoundException(`No app "${id}" in the catalog`);
    const current = this.jobs.get(id);
    if (current && current.state !== 'failed') {
      throw new ConflictException(`${d.name} is already being installed`);
    }
    const job: Job = { state: 'queued' };
    this.jobs.set(id, job);
    this.queue = this.queue
      .then(() => this.build(d, job))
      .catch((err: unknown) => {
        job.state = 'failed';
        job.reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`Installing ${id} failed: ${job.reason}`);
      });
    return job;
  }

  /** Wait for every queued install to settle. For tests. */
  settled(): Promise<void> {
    return this.queue;
  }

  async uninstall(id: string): Promise<void> {
    if (!isAppId(id)) throw new NotFoundException();
    const job = this.jobs.get(id);
    if (job && job.state !== 'failed') {
      throw new ConflictException(
        'It is being installed; wait for that to finish',
      );
    }
    const row = this.row(id);
    if (!row && !job) throw new NotFoundException();
    await this.servers.stop(id);
    this.dbs.db.prepare('DELETE FROM marketplace_apps WHERE id = ?').run(id);
    this.jobs.delete(id);
    await this.removeBuilds(id, null);
    await fs.rm(this.logPath(id), { force: true });
  }

  private async build(d: Descriptor, job: Job): Promise<void> {
    const buildId = `${d.source.ref.slice(0, 12)}-${randomBytes(4).toString('hex')}`;
    const dir = this.buildDir(d.id, buildId);
    const log: string[] = [];
    const writeLog = () =>
      fs.writeFile(this.logPath(d.id), log.join('\n'), { mode: 0o600 });
    const fail = async (reason: string) => {
      job.state = 'failed';
      job.reason = reason;
      log.push(`\n✗ ${reason}`);
      await writeLog().catch(() => undefined);
      await fs.rm(dir, { recursive: true, force: true });
    };
    const step = async (
      label: string,
      argv: readonly string[],
      cwd: string,
      env: NodeJS.ProcessEnv,
      timeoutMs: number,
    ): Promise<boolean> => {
      log.push(`$ ${argv.join(' ')}`);
      const result = await runStep(argv, { cwd, env, timeoutMs });
      if (result.output) log.push(result.output.trimEnd());
      await writeLog();
      if (!result.ok) {
        await fail(`${label}: ${result.reason ?? 'failed'}`);
        return false;
      }
      return true;
    };

    await this.prepareDirs();
    await fs.mkdir(dir, { recursive: true });
    log.push(`Installing ${d.name} from ${d.source.repo} at ${d.source.ref}`);

    // ── fetch exactly the pinned commit ──
    job.state = 'fetching';
    const gitEnv = this.gitEnv(d.source.repo);
    const git = (...args: string[]) => [
      'git',
      // Nothing from the repository may run during the fetch.
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ];
    if (
      !(await step('git init', git('init', '-q'), dir, gitEnv, 30_000)) ||
      !(await step(
        'Fetching the source',
        git(
          'fetch',
          '-q',
          '--depth',
          '1',
          '--no-tags',
          '--',
          d.source.repo,
          d.source.ref,
        ),
        dir,
        gitEnv,
        FETCH_TIMEOUT_MS,
      )) ||
      !(await step(
        'Checking out',
        git('checkout', '-q', '--detach', 'FETCH_HEAD'),
        dir,
        gitEnv,
        60_000,
      ))
    ) {
      return;
    }
    const head = await runStep(git('rev-parse', 'HEAD'), {
      cwd: dir,
      env: gitEnv,
      timeoutMs: 30_000,
    });
    if (head.output.trim() !== d.source.ref) {
      await fail(
        `The fetched commit is ${head.output.trim() || 'unknown'}, not ${d.source.ref}`,
      );
      return;
    }

    // ── the app's directory, which must really be inside the clone ──
    const rootRel = d.source.subdir ? posix.normalize(d.source.subdir) : '';
    const root = join(dir, rootRel);
    try {
      const realDir = await fs.realpath(dir);
      const realRoot = await fs.realpath(root);
      if (!isInside(realDir, realRoot) && realRoot !== realDir)
        throw new Error();
      if (!(await fs.stat(realRoot)).isDirectory()) throw new Error();
    } catch {
      await fail(`${d.source.subdir} is not a directory in the repository`);
      return;
    }

    // ── build ──
    job.state = 'building';
    const env = this.childEnv({});
    if (
      (d.build.install &&
        !(await step(
          'Installing dependencies',
          d.build.install,
          root,
          env,
          BUILD_TIMEOUT_MS,
        ))) ||
      !(await step('Building', d.build.command, root, env, BUILD_TIMEOUT_MS))
    ) {
      return;
    }

    // ── the entry: a real file inside the app's directory ──
    const entry = posix.normalize(d.build.entry);
    let servedBytes: number;
    try {
      const realRoot = await fs.realpath(root);
      const realEntry = await fs.realpath(join(root, entry));
      if (!isInside(realRoot, realEntry)) throw new Error();
      if (!(await fs.stat(realEntry)).isFile()) throw new Error();
      servedBytes = await directorySize(dirname(realEntry), realRoot);
    } catch {
      await fail(`The build did not produce ${d.build.entry}`);
      return;
    }
    if (servedBytes > MAX_SERVED_BYTES) {
      await fail(
        `The build output is ${Math.round(servedBytes / 1048576)} MB; the most an app may serve is ${MAX_SERVED_BYTES / 1048576} MB`,
      );
      return;
    }

    // ── switch to the new build ──
    // A running server belongs to the old build: stop it before its
    // directory goes.
    await this.servers.stop(d.id);
    this.dbs.db
      .prepare(
        `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, installed_at)
         VALUES (@id, @ref, @build_id, @root, @entry, @installed_at)
         ON CONFLICT (id) DO UPDATE SET ref = excluded.ref, build_id = excluded.build_id,
           root = excluded.root, entry = excluded.entry, installed_at = excluded.installed_at`,
      )
      .run({
        id: d.id,
        ref: d.source.ref,
        build_id: buildId,
        root: rootRel === '.' ? '' : rootRel,
        entry,
        installed_at: Date.now(),
      });
    this.jobs.delete(d.id);
    log.push(`\n✓ Installed ${d.name} (${buildId})`);
    await writeLog();
    await this.removeBuilds(d.id, buildId);
    this.logger.log(`Installed ${d.id} at ${d.source.ref}`);
  }

  // ── environments ─────────────────────────────────────────────────────────

  /**
   * The environment of a build step or an app's server: an allowlist, not the
   * backend's own minus a few names. None of the backend's configuration is a
   * build's business, and its HOME is not the user's, so neither `~/.npmrc`
   * nor `~/.gitconfig` (with whatever tokens they hold) is read.
   */
  childEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const cache = join(this.appsDir(), '.cache');
    const env: NodeJS.ProcessEnv = {};
    for (const name of PASSED_THROUGH) {
      if (process.env[name] !== undefined) env[name] = process.env[name];
    }
    env.PATH ??= '/usr/local/bin:/usr/bin:/bin';
    return {
      ...env,
      HOME: join(cache, 'home'),
      TMPDIR: join(cache, 'tmp'),
      npm_config_cache: join(cache, 'npm'),
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      CI: '1',
      ...extra,
    };
  }

  /** {@link childEnv}, plus git told to use the descriptor's protocol and nothing else. */
  private gitEnv(repo: string): NodeJS.ProcessEnv {
    return this.childEnv({
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      // The catalog allowed exactly this repo's scheme. Redirects and
      // submodules cannot switch to another (`ext::` above all).
      GIT_ALLOW_PROTOCOL: new URL(repo).protocol === 'file:' ? 'file' : 'https',
    });
  }

  private async prepareDirs(): Promise<void> {
    const cache = join(this.appsDir(), '.cache');
    for (const d of ['home', 'tmp', 'npm']) {
      await fs.mkdir(join(cache, d), { recursive: true, mode: 0o700 });
    }
  }

  // ── housekeeping ─────────────────────────────────────────────────────────

  /** Remove `<id>@*` build directories except `keep`. */
  private async removeBuilds(id: string, keep: string | null): Promise<void> {
    const names = await fs.readdir(this.appsDir()).catch(() => [] as string[]);
    for (const name of names) {
      if (name.startsWith(`${id}@`) && name !== `${id}@${keep}`) {
        await fs.rm(join(this.appsDir(), name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  /**
   * At boot: a build directory no row names is what an install interrupted
   * by a restart left behind. Nothing is in flight yet, so it can go.
   */
  private async sweepStaleBuilds(): Promise<void> {
    const live = new Set(this.rows().map((r) => `${r.id}@${r.build_id}`));
    const names = await fs.readdir(this.appsDir()).catch(() => [] as string[]);
    for (const name of names) {
      if (name.includes('@') && !live.has(name)) {
        await fs.rm(join(this.appsDir(), name), {
          recursive: true,
          force: true,
        });
      }
    }
  }
}

export function isAppId(id: string): boolean {
  return /^[a-z][a-z0-9-]{1,39}$/.test(id);
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep);
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bytes under `dir`, without following symlinks (a link out of the build is
 * not served: `servedFile` refuses it). Stops counting once past the cap.
 */
async function directorySize(dir: string, within: string): Promise<number> {
  if (!isInside(within, dir) && dir !== within) return Infinity;
  let total = 0;
  const stack = [dir];
  while (stack.length > 0 && total <= MAX_SERVED_BYTES) {
    const current = stack.pop()!;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) total += (await fs.lstat(path)).size;
    }
  }
  return total;
}
