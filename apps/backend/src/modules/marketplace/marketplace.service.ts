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
import type { AppManifest } from './app-manifest';
import { loadCatalog, type Catalog, type Descriptor } from './catalog';
import {
  MarketplaceServers,
  type ServerSpec,
} from './marketplace-servers.service';
import { PendingInspections } from './pending-inspections';
import { runStep } from './run-step';
import { SandboxTokens } from './sandbox-tokens';
import { isUrlAppId, type AppSource } from './source-url';
import { readUrlAppRow, type UrlAppRecord } from './url-app-record';

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

export interface InstalledRow {
  id: string;
  ref: string;
  build_id: string;
  /** The app's directory inside the clone (`source.subdir`), POSIX, '' for the top. */
  root: string;
  /** `build.entry`, relative to `root`. */
  entry: string;
  installed_at: number;
  /** `sandboxed` for an app installed from a URL (brief 158). */
  runtime: 'native' | 'sandboxed';
  /** A URL app's {@link AppSource}, as JSON. Null for a catalog app. */
  source: string | null;
  /** A URL app's `imbatranim.json`, as parsed, as JSON. Null for a catalog app. */
  manifest: string | null;
}

/**
 * Something the listing could not show as an app: a catalog file that did not
 * parse, or an installed app that cannot run. `appId` is set for the latter:
 * it is still installed, and `DELETE marketplace/apps/:appId` removes it.
 */
export interface ListingProblem {
  file: string;
  problem: string;
  appId?: string;
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
  /** The commit the catalog pins now; for a URL app, the installed one. */
  ref: string;
  /**
   * `native` runs in the desktop's page (a reviewed catalog app);
   * `sandboxed` in an opaque-origin frame (an app from a URL, brief 158).
   */
  runtime: 'native' | 'sandboxed';
  /** Where a URL app came from. Absent for a catalog app. */
  source?: AppSource;
  installed: {
    ref: string;
    buildId: string;
    installedAt: number;
    /**
     * What the desktop imports, relative to the API's base (`/api`). A URL
     * app has none: its files are served only under a sandbox token.
     */
    entryPath?: string;
    /** The build's directory is gone (a restored backup leaves it out): reinstall. */
    missing: boolean;
  } | null;
  job: Job | null;
  server: ReturnType<MarketplaceServers['status']>;
}

/**
 * Runs one command of a fetch or a build and says whether it worked. The
 * caller decides what a failure means: the catalog's install logs it and
 * fails the job, a URL check throws the HTTP error the pane shows.
 */
export type StepRunner = (
  label: string,
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) => Promise<boolean>;

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
  /**
   * Builds run one at a time: two at once is twice the memory and CPU. A URL
   * check's clone (brief 158) takes its turn here too, so git work never
   * overlaps.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService<Env, true>,
    private readonly servers: MarketplaceServers,
    private readonly tokens: SandboxTokens,
    private readonly pendings: PendingInspections,
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

  row(id: string): InstalledRow | undefined {
    return this.dbs.db
      .prepare('SELECT * FROM marketplace_apps WHERE id = ?')
      .get(id) as InstalledRow | undefined;
  }

  private rows(): InstalledRow[] {
    return this.dbs.db
      .prepare('SELECT * FROM marketplace_apps ORDER BY id')
      .all() as InstalledRow[];
  }

  buildDir(id: string, buildId: string): string {
    return join(this.appsDir(), `${id}@${buildId}`);
  }

  private logPath(id: string): string {
    return join(this.appsDir(), `${id}.log`);
  }

  // ── reading ──────────────────────────────────────────────────────────────

  async list(): Promise<{
    apps: MarketplaceApp[];
    problems: ListingProblem[];
  }> {
    const { apps, problems: catalogProblems } = this.catalog();
    const problems: ListingProblem[] = [...catalogProblems];
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
        runtime: 'native',
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
    for (const row of rows.values()) {
      if (row.runtime === 'sandboxed') {
        // A damaged row is left out of the apps and named here instead, so
        // one bad row cannot fail the whole listing; it can still be
        // uninstalled by its id.
        const record = this.urlAppRecord(row);
        if (record.ok) out.push(await this.urlAppEntry(row, record));
        else {
          problems.push({
            file: row.id,
            problem: `installed from a URL, but its stored ${record.damaged} is damaged: uninstall it`,
            appId: row.id,
          });
        }
        continue;
      }
      // An app installed from a descriptor that has since left the catalog is
      // no longer runnable, but its files are still on disk: list it, so it
      // can be uninstalled.
      if (apps.has(row.id)) continue;
      problems.push({
        file: `${row.id}.json`,
        problem: 'installed, but no longer in the catalog: uninstall it',
        appId: row.id,
      });
    }
    return { apps: out, problems };
  }

  /**
   * An installed URL app as the pane and the registry read it (brief 158):
   * its name, window and capabilities from its stored manifest, no
   * `entryPath` (its files are served only under a sandbox token) and no
   * server. Null when it is not one, or its stored row is damaged.
   */
  async urlApp(id: string): Promise<MarketplaceApp | null> {
    const row = this.row(id);
    if (row?.runtime !== 'sandboxed') return null;
    const record = this.urlAppRecord(row);
    return record.ok ? this.urlAppEntry(row, record) : null;
  }

  /**
   * An installed URL app's row, only when it is one and it reads back by
   * install's rules (`readUrlAppRow`). Minting a token and serving its files
   * go through here: a damaged row serves nothing.
   */
  sandboxedRow(id: string): InstalledRow | null {
    const row = this.row(id);
    if (row?.runtime !== 'sandboxed') return null;
    return this.urlAppRecord(row).ok ? row : null;
  }

  private urlAppRecord(row: InstalledRow): UrlAppRecord {
    return readUrlAppRow(row, this.appsDir());
  }

  private async urlAppEntry(
    row: InstalledRow,
    { manifest, source }: { manifest: AppManifest; source: AppSource },
  ): Promise<MarketplaceApp> {
    return {
      id: row.id,
      name: manifest.name,
      description: manifest.description,
      meta: manifest.meta,
      type: 'static',
      icon: manifest.icon,
      window: manifest.window,
      capabilities: manifest.capabilities as Descriptor['capabilities'],
      minSystemVersion: manifest.minSystemVersion,
      ref: row.ref,
      runtime: 'sandboxed',
      source,
      installed: {
        ref: row.ref,
        buildId: row.build_id,
        installedAt: row.installed_at,
        missing: !(await exists(
          join(this.buildDir(row.id, row.build_id), row.root, row.entry),
        )),
      },
      job: null,
      server: { state: 'stopped' },
    };
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
   * out or reaches through a symlink, a dotfile. A URL app's build is never
   * served here, only under its sandbox token with the sandbox's headers.
   */
  async servedFile(
    id: string,
    buildId: string,
    segments: string[],
  ): Promise<string> {
    const d = this.catalog().apps.get(id);
    const row = d ? this.row(id) : undefined;
    if (!row || row.runtime !== 'native' || row.build_id !== buildId) {
      throw new NotFoundException();
    }
    return resolveServed(this.servedRoot(row), segments);
  }

  /** The directory an installed app's files are served from: its entry's. */
  servedRoot(row: InstalledRow): string {
    return join(
      this.buildDir(row.id, row.build_id),
      row.root,
      posix.dirname(row.entry),
    );
  }

  /**
   * A 404 for an app installed from a URL (or an id only such an app could
   * have) on a route of the native runtime: install, the build's files, the
   * lease and the server proxy. A URL app has no build and no server, and its
   * files are served only with the sandbox's headers.
   */
  refuseSandboxed(id: string): void {
    if (isUrlAppId(id) || this.row(id)?.runtime === 'sandboxed') {
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
    this.refuseSandboxed(id);
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

  /**
   * Run `work` when the builds queued before it are done, and answer with its
   * result. A URL check uses it: its HTTP call waits for the clone, which
   * still never runs beside a build.
   */
  runQueued<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
    // A URL app's open windows lose their files now, not in six hours.
    this.tokens.revokeApp(id);
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
    if (!(await this.fetchCommit(dir, d.source.repo, d.source.ref, step, fail)))
      return;

    // ── the app's directory, which must really be inside the clone ──
    const rootRel = d.source.subdir ? posix.normalize(d.source.subdir) : '';
    const root = join(dir, rootRel);
    if (!(await isDirectoryWithin(dir, root))) {
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

  /**
   * Fetch exactly `commit` of `repo` into the empty directory `dir`: hooks
   * off, one commit deep, no tags, and `HEAD` checked against the commit
   * afterwards. Shared by the catalog's builds and the URL apps' clones
   * (brief 158), which run no step after it. `fail` is told when the fetched
   * commit is another; a failed command is `step`'s to report.
   *
   * `beforeCheckout` runs once the commit is fetched and before anything is
   * written outside `.git`; false stops there. The URL check measures what
   * the checkout would write with it. The catalog's builds pass none.
   */
  async fetchCommit(
    dir: string,
    repo: string,
    commit: string,
    step: StepRunner,
    fail: (reason: string) => Promise<void>,
    beforeCheckout?: (gitEnv: NodeJS.ProcessEnv) => Promise<boolean>,
  ): Promise<boolean> {
    const gitEnv = this.gitEnv(repo);
    if (
      !(await step('git init', gitArgv('init', '-q'), dir, gitEnv, 30_000)) ||
      !(await step(
        'Fetching the source',
        gitArgv('fetch', '-q', '--depth', '1', '--no-tags', '--', repo, commit),
        dir,
        gitEnv,
        FETCH_TIMEOUT_MS,
      )) ||
      (beforeCheckout && !(await beforeCheckout(gitEnv))) ||
      !(await step(
        'Checking out',
        gitArgv('checkout', '-q', '--detach', 'FETCH_HEAD'),
        dir,
        gitEnv,
        60_000,
      ))
    ) {
      return false;
    }
    const head = await runStep(gitArgv('rev-parse', 'HEAD'), {
      cwd: dir,
      env: gitEnv,
      timeoutMs: 30_000,
    });
    if (head.output.trim() !== commit) {
      await fail(
        `The fetched commit is ${head.output.trim() || 'unknown'}, not ${commit}`,
      );
      return false;
    }
    return true;
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
  gitEnv(repo: string): NodeJS.ProcessEnv {
    return this.childEnv({
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      // The catalog allowed exactly this repo's scheme. Redirects and
      // submodules cannot switch to another (`ext::` above all).
      GIT_ALLOW_PROTOCOL: new URL(repo).protocol === 'file:' ? 'file' : 'https',
    });
  }

  async prepareDirs(): Promise<void> {
    const cache = join(this.appsDir(), '.cache');
    for (const d of ['home', 'tmp', 'npm']) {
      await fs.mkdir(join(cache, d), { recursive: true, mode: 0o700 });
    }
  }

  // ── housekeeping ─────────────────────────────────────────────────────────

  /**
   * Remove `<id>@*` build directories except `keep`, and except a URL check's
   * clone still cloning or waiting for consent (it is not a build yet).
   */
  async removeBuilds(id: string, keep: string | null): Promise<void> {
    const names = await fs.readdir(this.appsDir()).catch(() => [] as string[]);
    for (const name of names) {
      if (
        name.startsWith(`${id}@`) &&
        name !== `${id}@${keep}` &&
        !this.pendings.holds(name)
      ) {
        await fs.rm(join(this.appsDir(), name), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  /**
   * At boot: a build directory no row names is what an install interrupted
   * by a restart left behind. Nothing is in flight yet, so it can go. That
   * includes a URL check's clone: pending checks live in memory, so none
   * survives the restart, and this runs only here, before any request.
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

/** git with nothing from the repository allowed to run during the fetch. */
export function gitArgv(...args: string[]): string[] {
  return ['git', '-c', 'core.hooksPath=/dev/null', ...args];
}

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep);
}

/** True when `path` is a directory that really (through symlinks) is `dir` or inside it. */
export async function isDirectoryWithin(
  dir: string,
  path: string,
): Promise<boolean> {
  try {
    const realDir = await fs.realpath(dir);
    const realPath = await fs.realpath(path);
    if (!isInside(realDir, realPath) && realPath !== realDir) return false;
    return (await fs.stat(realPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The real path of the file `segments` name inside `servedRoot`, or a 404:
 * for an empty or dot segment (dotfiles are never served, and `..` is one),
 * one holding a separator, a path that climbs out or reaches through a
 * symlink, or anything that is not a file. Both the native build route and
 * the sandbox's use it.
 */
export async function resolveServed(
  servedRoot: string,
  segments: string[],
): Promise<string> {
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

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bytes under `dir`, without following symlinks (a link out of the build is
 * not served: `servedFile` refuses it). Stops counting once past `cap`.
 */
export async function directorySize(
  dir: string,
  within: string,
  cap = MAX_SERVED_BYTES,
): Promise<number> {
  if (!isInside(within, dir) && dir !== within) return Infinity;
  let total = 0;
  const stack = [dir];
  while (stack.length > 0 && total <= cap) {
    const current = stack.pop()!;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) total += (await fs.lstat(path)).size;
    }
  }
  return total;
}
