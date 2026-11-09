import {
  ConflictException,
  InternalServerErrorException,
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
import { AppDataService } from '../app-data/app-data.service';
import { RecentService } from '../files/recent.service';
import { AppTokens } from '../app-identity/app-tokens';
import { FileGrants } from '../app-identity/file-grants.service';
import { InstalledApps } from '../app-identity/installed-apps';
import { z } from 'zod';

import {
  loadCatalog,
  type Catalog,
  type CatalogApp,
  type Descriptor,
} from './catalog';
import {
  MarketplaceServers,
  type ServerSpec,
} from './marketplace-servers.service';
import { PendingInspections } from './pending-inspections';
import { readManifestJson, manifestVersion } from './manifest-file';
import {
  NATIVE_MANIFEST_VERSION,
  parseNativeManifest,
} from './native-manifest';
import { isAppId, recordedBuild, recordedKitApp } from './recorded-build';
import { runStep } from './run-step';
import { isUrlAppId, type AppSource } from './source-url';
import {
  readNativeUrlRow,
  retiredUrlApp,
  type UrlTrust,
} from './url-app-record';
import {
  isVerified,
  loadVerified,
  verifiedEntry,
  type VerifiedList,
} from './verified';

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
  /**
   * Relative to `root`. For a row with no {@link entries} (a version 1
   * descriptor's, or a URL app's): the module, whose directory is served.
   * For a version 2 descriptor's row: the build's `output`, the
   * served directory itself.
   */
  entry: string;
  /**
   * A version 2 descriptor's build: JSON, app id → that app's
   * module inside `entry`, as the build that is live produced them. Null for
   * every other row. A kit app's is an object instead of the
   * module's path: `{ entry, styles, sharedKit }`, its stylesheets and the
   * shared kit version its build was made against, with `background: true`
   * and `commandSources: true` beside them for the hooks it declared. See
   * {@link recordedBuild}.
   */
  entries: string | null;
  installed_at: number;
  /**
   * `native` for every row the OS writes now. `sandboxed` is a leftover
   * prebuilt (version 1) app from a URL, installed before that path was
   * retired: it lists as no longer supported, runs nothing and can only be
   * uninstalled.
   */
  runtime: 'native' | 'sandboxed';
  /**
   * A URL app's {@link AppSource}, as JSON; a native one's also carries its
   * trust record ({@link UrlTrust}) as `trust`. Null for a catalog app.
   */
  source: string | null;
  /** A URL app's `imbatranim.json`, as JSON. Null for a catalog app. */
  manifest: string | null;
}

/**
 * Something the listing could not show as an app: a catalog file that did not
 * parse, or an installed app that cannot run. `appId` is set for the latter:
 * it is still installed, and `DELETE marketplace/apps/:appId` removes it.
 * `retired` marks a leftover prebuilt app from a URL, which this OS no longer
 * runs, with its name and source as far as its row still reads.
 */
export interface ListingProblem {
  file: string;
  problem: string;
  appId?: string;
  retired?: { name: string; source: AppSource | null };
}

/**
 * What the Marketplace pane and the desktop's registry read: one app. A
 * version 2 descriptor lists one per item of its `apps`, each
 * carrying the descriptor's ref, type, install, job and server.
 */
export interface MarketplaceApp {
  id: string;
  /**
   * The descriptor that installs it, and what the routes keyed by `:id`
   * (install, uninstall, log, lease, server, built files) take. Equal to
   * `id` for a version 1 descriptor's app and for a URL app.
   */
  descriptorId: string;
  /** The descriptor's name: the pane's heading for a suite. `name` otherwise. */
  descriptorName: string;
  name: string;
  description: string;
  meta: string[];
  type: Descriptor['type'];
  icon: string;
  window: CatalogApp['window'];
  capabilities: CatalogApp['capabilities'];
  /** Whether a second launch opens a second window. False unless the descriptor says so. */
  multiInstance: boolean;
  /** The file types it offers to open (Open With). Empty when none. */
  opens: string[];
  /**
   * A kit app whose module exports `Background`, which the desktop mounts
   * with no window. Installed: what the live build declared, like
   * `sharedKit`. False for a mount app and a URL app; older desktops ignore it.
   */
  background: boolean;
  /** A kit app whose module exports `commandSources`, read like `background`. */
  commandSources: boolean;
  minSystemVersion: number;
  /**
   * The shared kit version a kit app was built against, or null
   * for an app that exports `mount`. Installed: what the live build was made
   * against, so the desktop runs it the way it was built until a reinstall.
   * Not installed: what the descriptor says now.
   */
  sharedKit: number | null;
  /**
   * What the catalog's descriptor says now, whatever was built.
   * Beside an installed `sharedKit` it tells the desktop whether a rebuild
   * at the same ref would fix a kit mismatch. Null for an app that exports
   * `mount` and for a URL app. Older desktops ignore it.
   */
  catalogSharedKit: number | null;
  /** The commit the catalog pins now; for a URL app, the installed one. */
  ref: string;
  /** It runs in the desktop's page: a catalog app, or an app from a URL built from source. */
  runtime: 'native';
  /** Where a URL app came from. Absent for a catalog app. */
  source?: AppSource;
  /**
   * A URL app that runs natively: how it came to be trusted at its installed
   * commit when it was installed (`by`, `at`, the stored record), and whether
   * the verified list this OS carries names that commit now (`verified`).
   * The badge reads `verified` first, so an entry a later release drops stops
   * showing as Verified. Absent for a catalog app.
   */
  trust?: UrlTrust & { verified: boolean };
  installed: {
    ref: string;
    buildId: string;
    installedAt: number;
    /**
     * What the desktop imports, relative to the API's base (`/api`). Absent
     * when the live build recorded no module for the app.
     */
    entryPath?: string;
    /**
     * A kit app's stylesheets, served paths like {@link entryPath} (brief
     * 163). Empty for a mount app; absent with `entryPath`.
     */
    stylePaths?: string[];
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

/**
 * A descriptor the marketplace installs, serves and runs: the catalog's, or
 * that of an app from a URL that runs natively, with its source and trust.
 */
interface Known {
  d: Descriptor;
  url: { source: AppSource; trust: UrlTrust } | null;
}

/** What a build fetches and builds: a catalog descriptor, or an app from a URL. */
type BuildTarget =
  | { kind: 'catalog'; d: Descriptor }
  | {
      kind: 'url';
      /** The descriptor at the commit being built, once known. */
      d: Descriptor | null;
      /** Its `imbatranim.json` as read, when `d` is known. */
      manifest: unknown;
      source: AppSource;
      trust: UrlTrust;
      /** A clone a URL check already fetched at the commit: built in place. */
      fetched: { dir: string; buildId: string } | null;
    };

/** The pieces of the environment a build or an app's server gets. Nothing else. */
const PASSED_THROUGH = ['PATH', 'LANG', 'LC_ALL', 'TZ'] as const;

/**
 * The marketplace: installs the apps the in-repo catalog
 * describes, by cloning each at its pinned commit and building it in the live
 * container.
 *
 * What keeps this from being "run anything from the internet" is the catalog:
 * an id that is not described there cannot be installed or served, and the
 * descriptor fixes the repository, the commit and the commands. An app from a
 * URL built from source goes through the same installer once the verified
 * list names its commit or the owner trusts it (`MarketplaceUrlApps`); its
 * descriptor is its `imbatranim.json` at that commit, kept with its row. A build still
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
   * A URL app's install queued or failed before it has a row: what the
   * listing shows for its job, and what Clear forgets.
   */
  private readonly urlJobs = new Map<string, Known>();
  /**
   * Builds run one at a time: two at once is twice the memory and CPU. A URL
   * check's clone takes its turn here too, so git work never
   * overlaps.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService<Env, true>,
    private readonly servers: MarketplaceServers,
    private readonly pendings: PendingInspections,
    private readonly data: AppDataService,
    private readonly appTokens: AppTokens,
    private readonly grants: FileGrants,
    private readonly installed: InstalledApps,
    private readonly recent: RecentService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { descriptors, problems } = this.catalog();
    for (const p of problems) {
      this.logger.warn(`Skipped marketplace/${p.file}: ${p.problem}`);
    }
    const verified = this.verified();
    if (verified.problem) {
      this.logger.warn(
        `marketplace/verified.json verifies nothing: ${verified.problem}`,
      );
    }
    if (descriptors.size > 0) {
      this.logger.log(
        `Marketplace catalog: ${[...descriptors.keys()].join(', ')}`,
      );
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

  /**
   * The verified apps from a URL (`verified.ts`). Read on every call, like the
   * catalog.
   */
  verified(): VerifiedList {
    return loadVerified(resolve(this.config.get('MARKETPLACE_DIR')), {
      allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS'),
    });
  }

  /**
   * The descriptor `id` names: the catalog's, or an installed URL app's that
   * runs natively and whose row reads back. Null for anything else.
   */
  private known(id: string): Known | null {
    const d = this.catalog().descriptors.get(id);
    if (d) return { d, url: null };
    if (!isUrlAppId(id)) return null;
    const row = this.row(id);
    if (row?.runtime !== 'native') return null;
    const record = this.nativeUrlRecord(row);
    return record.ok
      ? {
          d: record.descriptor,
          url: { source: record.source, trust: record.trust },
        }
      : null;
  }

  private nativeUrlRecord(row: InstalledRow) {
    return readNativeUrlRow(row, {
      allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS'),
    });
  }

  /** True while an install of `id` is queued or running. */
  isInstalling(id: string): boolean {
    const job = this.jobs.get(id);
    return !!job && job.state !== 'failed';
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
    const { descriptors, problems: catalogProblems } = this.catalog();
    const problems: ListingProblem[] = [...catalogProblems];
    const verified = this.verified();
    if (verified.problem) {
      problems.push({
        file: 'verified.json',
        problem: `${verified.problem}; no app from a URL is verified`,
      });
    }
    const rows = new Map(this.rows().map((r) => [r.id, r]));
    const out: MarketplaceApp[] = [];
    for (const d of descriptors.values()) {
      out.push(...(await this.entriesOf(d, rows.get(d.id), null, verified)));
    }
    for (const row of rows.values()) {
      if (row.runtime === 'sandboxed') {
        // A prebuilt app from a URL, installed before that path was retired.
        // Nothing of it runs any more; it is listed so it can be uninstalled.
        const retired = retiredUrlApp(row);
        problems.push({
          file: row.id,
          problem: `${retired.name} is a prebuilt app from a URL, which this OS no longer supports: uninstall it`,
          appId: row.id,
          retired,
        });
        continue;
      }
      if (isUrlAppId(row.id)) {
        const record = this.nativeUrlRecord(row);
        if (record.ok) {
          out.push(
            ...(await this.entriesOf(
              record.descriptor,
              row,
              { source: record.source, trust: record.trust },
              verified,
            )),
          );
        } else {
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
      if (descriptors.has(row.id)) continue;
      problems.push({
        file: `${row.id}.json`,
        problem: 'installed, but no longer in the catalog: uninstall it',
        appId: row.id,
      });
    }
    // A URL app's first install, queued, building or failed: no row yet, or
    // only a retired sandboxed one, which the install replaces.
    for (const [id, k] of this.urlJobs) {
      if (!rows.has(id) || rows.get(id)?.runtime === 'sandboxed')
        out.push(...(await this.entriesOf(k.d, undefined, k.url, verified)));
    }
    return { apps: out, problems };
  }

  /**
   * One descriptor's apps as the listing shows them. For a URL app, `ref` is
   * the commit the verified list names for it when it names one (so a
   * verified app's update shows as the catalog's does), else its installed
   * commit.
   */
  private async entriesOf(
    d: Descriptor,
    row: InstalledRow | undefined,
    url: Known['url'],
    verified: VerifiedList,
  ): Promise<MarketplaceApp[]> {
    const out: MarketplaceApp[] = [];
    let ref = d.source.ref;
    let trust: MarketplaceApp['trust'];
    if (url) {
      const commit = row?.ref ?? url.source.commit;
      ref =
        verifiedEntry(verified, url.source.repo, url.source.subdir)?.commit ??
        commit;
      trust = {
        ...url.trust,
        verified: isVerified(verified, { ...url.source, commit }),
      };
    }
    // What the live build produced, not what the descriptor says now: an
    // app added to the descriptor since has nothing to load until the
    // next install, and lists as missing.
    const recorded = row ? recordedBuild(row) : null;
    for (const a of d.apps) {
      let installed: MarketplaceApp['installed'] = null;
      const built = recorded?.entries.get(a.id);
      if (row) {
        const served = (p: string) =>
          `marketplace/apps/${d.id}/b/${row.build_id}/${urlPath(p)}`;
        installed = {
          ref: row.ref,
          buildId: row.build_id,
          installedAt: row.installed_at,
          ...(built !== undefined && {
            entryPath: served(built.entry),
            stylePaths: built.styles.map(served),
          }),
          missing:
            built === undefined ||
            !(await exists(
              join(
                this.buildDir(d.id, row.build_id),
                row.root,
                recorded!.output,
                built.entry,
              ),
            )),
        };
      }
      out.push({
        id: a.id,
        descriptorId: d.id,
        descriptorName: d.name,
        name: a.name,
        description: a.description,
        meta: a.meta,
        type: d.type,
        icon: a.icon,
        window: a.window,
        capabilities: a.capabilities,
        multiInstance: a.multiInstance,
        opens: a.opens,
        // What the live build declared: a descriptor that adds a hook at a
        // new ref changes nothing until that ref is installed, so the desktop
        // never looks for an export the module it has cannot hold.
        background: built ? built.background : a.background,
        commandSources: built ? built.commandSources : a.commandSources,
        minSystemVersion: d.minSystemVersion,
        sharedKit: built ? built.sharedKit : d.sharedKit,
        catalogSharedKit: d.sharedKit,
        ref,
        runtime: 'native',
        ...(url && { source: url.source, trust }),
        installed,
        job: this.jobs.get(d.id) ?? null,
        server: this.servers.status(d.id),
      });
    }
    return out;
  }

  async log(id: string): Promise<string> {
    if (!isAppId(id)) throw new NotFoundException();
    const build = await fs.readFile(this.logPath(id), 'utf8').catch(() => '');
    const server = this.servers.output(id);
    return server ? `${build}\n── server ──\n${server}` : build;
  }

  /**
   * The file a request for an installed descriptor's build names, as a real
   * path inside its served directory. `id` is the descriptor's:
   * the apps of a suite share the directory, and the chunks in it. Anything
   * else is a 404: an id outside the catalog and no native URL app's, a build
   * that is not the live one, a path that climbs out or reaches through a
   * symlink, a dotfile. A leftover sandboxed URL app's files are never
   * served.
   */
  async servedFile(
    id: string,
    buildId: string,
    segments: string[],
  ): Promise<string> {
    const row = this.known(id) ? this.row(id) : undefined;
    if (!row || row.runtime !== 'native' || row.build_id !== buildId) {
      throw new NotFoundException();
    }
    return resolveServed(this.servedRoot(row), segments);
  }

  /**
   * The directory an installed row's files are served from: a version 2
   * build's `output`, otherwise its entry's directory (see `InstalledRow`).
   */
  servedRoot(row: InstalledRow): string {
    return join(
      this.buildDir(row.id, row.build_id),
      row.root,
      row.entries != null ? row.entry : posix.dirname(row.entry),
    );
  }

  /**
   * A 404 for an id only a URL app could have, unless its row runs natively,
   * on a route of the native runtime: install, the build's files, the lease
   * and the server proxy. A leftover sandboxed app from a URL has no build
   * and no server, and runs nothing. A URL app that runs natively uses these
   * routes as a catalog app does.
   */
  refuseUnlessNative(id: string): void {
    const runtime = this.row(id)?.runtime;
    if (runtime === 'sandboxed' || (isUrlAppId(id) && runtime !== 'native')) {
      throw new NotFoundException();
    }
  }

  /**
   * What the supervisor needs to start an installed service descriptor's
   * server, or a 404 when there is no such descriptor, a 409 when it is not a
   * service or not built. One server per descriptor: every
   * window of a suite's apps leases this one, by the descriptor's id.
   */
  serverSpec(id: string): ServerSpec {
    const d = this.known(id)?.d;
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
   * build at the catalog's ref) of a descriptor, and so of every app in it.
   * Answers at once; the pane polls `list`.
   *
   * An installed URL app that runs natively builds again too: at the commit
   * the verified list names for it, if it names one (a verified app updates
   * as the list moves), otherwise at its installed commit, which it was
   * trusted at (a reinstall). Any other commit goes through a URL check and,
   * unless verified, the owner's trust (`MarketplaceUrlApps`).
   */
  install(id: string): Job {
    this.refuseUnlessNative(id);
    const known = this.known(id);
    if (!known) throw new NotFoundException(`No app "${id}" in the catalog`);
    const { d, url } = known;
    if (this.isInstalling(id)) {
      throw new ConflictException(`${d.name} is already being installed`);
    }
    if (!url) return this.enqueue(id, { kind: 'catalog', d });
    const verified = this.verified();
    const listed = verifiedEntry(verified, url.source.repo, url.source.subdir);
    const commit = listed?.commit ?? url.source.commit;
    return this.enqueue(id, {
      kind: 'url',
      // Read again from the fresh clone: the manifest is the commit's.
      d: null,
      manifest: null,
      source: { ...url.source, commit },
      trust: listed ? { by: 'verified', at: Date.now() } : url.trust,
      fetched: null,
    });
  }

  /**
   * Queue a URL app's native install from a check's clone, which is built in
   * place. The caller has made sure it is verified at that commit or the owner
   * trusts it, and that `id` is not being installed already.
   */
  installFromUrl(
    id: string,
    target: Extract<BuildTarget, { kind: 'url' }> & { d: Descriptor },
  ): Job {
    if (this.isInstalling(id)) {
      throw new ConflictException(
        `${target.d.name} is already being installed`,
      );
    }
    this.urlJobs.set(id, {
      d: target.d,
      url: { source: target.source, trust: target.trust },
    });
    return this.enqueue(id, target);
  }

  /**
   * True when the verified list vouches for an app from a URL at exactly its
   * commit.
   */
  isVerified(source: AppSource): boolean {
    return isVerified(this.verified(), source);
  }

  /** The listing's entries for one descriptor, for a URL install's answer. */
  async listed(id: string): Promise<MarketplaceApp[]> {
    return (await this.list()).apps.filter((a) => a.descriptorId === id);
  }

  private enqueue(id: string, target: BuildTarget): Job {
    const job: Job = { state: 'queued' };
    this.jobs.set(id, job);
    this.queue = this.queue
      .then(() => this.build(id, target, job))
      .catch(async (err: unknown) => {
        job.state = 'failed';
        job.reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`Installing ${id} failed: ${job.reason}`);
        if (target.kind === 'url' && target.fetched) {
          await fs
            .rm(target.fetched.dir, { recursive: true, force: true })
            .catch(() => undefined);
        }
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

  /**
   * Remove an installed descriptor: its server, row, builds and log, and the
   * caches of its apps. Their settings, data and state stay for a reinstall,
   * and so do their recents, unless `removeData`, which takes those folders
   * first (if they can't be removed, the app stays installed and the error
   * says so), then their recents.
   */
  async uninstall(
    id: string,
    { removeData = false }: { removeData?: boolean } = {},
  ): Promise<void> {
    if (!isAppId(id)) throw new NotFoundException();
    const job = this.jobs.get(id);
    if (job && job.state !== 'failed') {
      throw new ConflictException(
        'It is being installed; wait for that to finish',
      );
    }
    const row = this.row(id);
    if (!row && !job) throw new NotFoundException();
    const apps = appsOfRow(row, id);
    // From here its apps are leaving: an open window can't take a new
    // identity or write data, so nothing it does puts back what is removed.
    await this.installed.whileLeaving(apps, async () => {
      for (const app of apps) {
        this.appTokens.revokeApp(app);
        this.grants.revokeApp(app);
      }
      await this.servers.stop(id);
      if (removeData) {
        try {
          await this.data.removeFolders(apps, KEPT_DATA_KINDS);
        } catch (err) {
          throw new InternalServerErrorException(
            `Its data could not be removed, so it is still installed: ${String(err)}`,
          );
        }
        // Its recents go with its data (owner, 2026-11-09): a reinstall gets
        // no file or folder back it was given before. Without the box they
        // stay, as its data does.
        this.recent.removeApps(apps);
      }
      this.dbs.db.prepare('DELETE FROM marketplace_apps WHERE id = ?').run(id);
      this.jobs.delete(id);
      this.urlJobs.delete(id);
      await this.removeBuilds(id, null);
      await fs.rm(this.logPath(id), { force: true });
      await this.data.removeCaches(apps);
    });
  }

  private async build(
    id: string,
    target: BuildTarget,
    job: Job,
  ): Promise<void> {
    const url = target.kind === 'url' ? target : null;
    const repo = url ? url.source.repo : target.d!.source.repo;
    const commit = url ? url.source.commit : target.d!.source.ref;
    const subdir = url ? url.source.subdir : target.d!.source.subdir;
    const buildId =
      url?.fetched?.buildId ??
      `${commit.slice(0, 12)}-${randomBytes(4).toString('hex')}`;
    const dir = this.buildDir(id, buildId);
    const log: string[] = [];
    const writeLog = () =>
      fs.writeFile(this.logPath(id), log.join('\n'), { mode: 0o600 });
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
    log.push(
      `Installing ${target.d?.name ?? id} from ${repo} at ${commit}` +
        (url
          ? ` (${url.trust.by === 'verified' ? 'verified' : 'trusted by you'})`
          : ''),
    );

    // ── fetch exactly the pinned commit, unless a URL check already did ──
    job.state = 'fetching';
    if (url?.fetched) {
      log.push(`Using the checked clone (${buildId})`);
    } else {
      await fs.mkdir(dir, { recursive: true });
      if (!(await this.fetchCommit(dir, repo, commit, step, fail))) return;
    }

    // ── the app's directory, which must really be inside the clone ──
    const rootRel = subdir ? posix.normalize(subdir) : '';
    const root = join(dir, rootRel);
    if (!(await isDirectoryWithin(dir, root))) {
      await fail(`${subdir} is not a directory in the repository`);
      return;
    }

    // ── a URL app's descriptor is its imbatranim.json at this commit ──
    let d: Descriptor;
    let manifest: unknown = null;
    if (!url) d = target.d!;
    else if (url.d) {
      d = url.d;
      manifest = url.manifest;
    } else {
      const read = await this.readNativeManifest(root, url.source);
      if (!read.ok) {
        await fail(read.problem);
        return;
      }
      d = read.d;
      manifest = read.manifest;
    }
    if (d.id !== id) {
      await fail(`The app at ${commit} is not ${id}`);
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

    // ── the output, a real directory inside the app's directory, and every
    // app's entry, a real file inside the output. One missing fails the
    // whole install, and the build that is live stays live. ──
    const output = d.build.output;
    let realRoot: string;
    let realOutput: string | null = null;
    try {
      realRoot = await fs.realpath(root);
    } catch {
      await fail("The build removed the app's own directory");
      return;
    }
    try {
      const real = await fs.realpath(join(root, output));
      if (isInside(realRoot, real) && (await fs.stat(real)).isDirectory()) {
        realOutput = real;
      }
    } catch {
      // Reported below, as the first entry it does not hold.
    }
    for (const a of d.apps) {
      // A kit app's stylesheets are checked like its module: a
      // listed file the build did not write fails the install.
      for (const file of [a.entry, ...a.styles]) {
        if (!realOutput || !(await isFileWithin(realOutput, file))) {
          await fail(`The build did not produce ${posix.join(output, file)}`);
          return;
        }
      }
    }
    const servedBytes = await directorySize(realOutput!, realRoot);
    if (servedBytes > MAX_SERVED_BYTES) {
      await fail(
        `The build output is ${Math.round(servedBytes / 1048576)} MB; the most an app may serve is ${MAX_SERVED_BYTES / 1048576} MB`,
      );
      return;
    }

    // ── switch to the new build ──
    // A running server belongs to the old build: stop it before its
    // directory goes.
    await this.servers.stop(id);
    // A version 1 row is written exactly as before one catalog entry, several apps: the entry, and
    // no entries. A version 2 row names the output and each app's module; a
    // kit app's also its stylesheets, its shared kit version and the hooks
    // it declared (only those it did, so a row without hooks reads as before).
    // A URL app's row also keeps its source, with the trust record, and its
    // manifest; it replaces a leftover sandboxed install of the same app.
    const suite = d.schemaVersion === 2;
    const kit = d.sharedKit;
    this.dbs.db
      .prepare(
        `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, entries, installed_at, runtime, source, manifest)
         VALUES (@id, @ref, @build_id, @root, @entry, @entries, @installed_at, 'native', @source, @manifest)
         ON CONFLICT (id) DO UPDATE SET ref = excluded.ref, build_id = excluded.build_id,
           root = excluded.root, entry = excluded.entry, entries = excluded.entries,
           installed_at = excluded.installed_at, runtime = excluded.runtime,
           source = excluded.source, manifest = excluded.manifest`,
      )
      .run({
        id,
        ref: commit,
        build_id: buildId,
        root: rootRel === '.' ? '' : rootRel,
        entry: suite ? output : posix.join(output, d.apps[0].entry),
        entries: suite
          ? JSON.stringify(
              Object.fromEntries(
                d.apps.map((a) => [
                  a.id,
                  kit === null
                    ? a.entry
                    : ({
                        entry: a.entry,
                        styles: a.styles,
                        sharedKit: kit,
                        ...(a.background && { background: true as const }),
                        ...(a.commandSources && {
                          commandSources: true as const,
                        }),
                      } satisfies z.infer<typeof recordedKitApp>),
                ]),
              ),
            )
          : null,
        installed_at: Date.now(),
        source: url
          ? JSON.stringify({ ...url.source, trust: url.trust })
          : null,
        manifest: url ? JSON.stringify(manifest) : null,
      });
    this.jobs.delete(id);
    this.urlJobs.delete(id);
    log.push(`\n✓ Installed ${d.name} (${buildId})`);
    await writeLog();
    await this.removeBuilds(id, buildId);
    this.logger.log(`Installed ${id} at ${commit}`);
  }

  /**
   * A URL app's `imbatranim.json` in a fetched clone, read as the descriptor
   * it installs as. It must be a version 2 manifest.
   */
  private async readNativeManifest(
    root: string,
    source: AppSource,
  ): Promise<
    | { ok: true; d: Descriptor; manifest: unknown }
    | { ok: false; problem: string }
  > {
    let raw: unknown;
    try {
      raw = await readManifestJson(
        root,
        source.subdir ? `${source.subdir} in ${source.repo}` : source.repo,
      );
    } catch (err) {
      return { ok: false, problem: (err as Error).message };
    }
    if (manifestVersion(raw) !== NATIVE_MANIFEST_VERSION) {
      return {
        ok: false,
        problem: `At ${source.commit.slice(0, 7)} the app's imbatranim.json is not version ${NATIVE_MANIFEST_VERSION}, the only one this OS installs.`,
      };
    }
    const parsed = parseNativeManifest(raw, source, {
      allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS'),
    });
    return parsed.ok
      ? { ok: true, d: parsed.descriptor, manifest: raw }
      : { ok: false, problem: parsed.problem };
  }

  /**
   * Fetch exactly `commit` of `repo` into the empty directory `dir`: hooks
   * off, one commit deep, no tags, and `HEAD` checked against the commit
   * afterwards. Shared by the catalog's builds and the URL apps' clones
   *, which run no step after it. `fail` is told when the fetched
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

/** The kinds of an app's data that outlive an uninstall unless the owner asks. */
const KEPT_DATA_KINDS = ['config', 'data', 'state'] as const;

/**
 * The apps a row holds: its build's apps, or the row's own id for one whose
 * record is damaged or that never got a row (an install that failed). A URL
 * app's row holds the one app.
 */
function appsOfRow(row: InstalledRow | undefined, id: string): string[] {
  const apps = row ? recordedBuild(row)?.entries.keys() : undefined;
  return apps ? [...apps] : [id];
}

/** A path inside a build as it goes in a URL: each segment encoded. */
function urlPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

/** True when `rel`, inside the real directory `realDir`, is really a file there. */
async function isFileWithin(realDir: string, rel: string): Promise<boolean> {
  try {
    const real = await fs.realpath(join(realDir, rel));
    return isInside(realDir, real) && (await fs.stat(real)).isFile();
  } catch {
    return false;
  }
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
 * symlink, or anything that is not a file.
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

export { isAppId, recordedBuild, type RecordedApp } from './recorded-build';
