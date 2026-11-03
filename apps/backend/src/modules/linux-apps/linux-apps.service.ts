import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { promisify } from 'util';
import { childEnv } from '../../child-env';
import { terminalEnv } from '../pty/pty.constants';
import { isValidSessionId } from '../wayland/wayland.protocol';
import { WaylandGateway } from '../wayland/wayland.gateway';
import { SessionApps } from '../wayland/session-apps';
import { execArgv, parseDesktopEntry } from './desktop-entry';
import {
  linuxAppsPaths,
  parsePin,
  type LinuxAppsPaths,
} from './linux-apps.paths';
import {
  buildIndex,
  isValidAttr,
  searchIndex,
  type PackageRow,
  type SearchResult,
} from './package-index';

const run = promisify(execFile);

/** At most this many search results. */
export const SEARCH_LIMIT = 50;
/** The most of a job's output kept; the end explains a failure. */
const LOG_MAX = 64 * 1024;
/** An install may take this long before it is stopped. */
const JOB_TIMEOUT_MS = 30 * 60_000;
/** The in-memory index goes after this long without a search. */
const INDEX_IDLE_MS = 15 * 60_000;
/** The store's size is measured at most this often. */
const STORE_SIZE_TTL_MS = 15_000;

export type IndexState =
  | 'ready'
  | 'building'
  | 'missing'
  | 'mismatch'
  | 'failed';

export interface LinuxAppsStatus {
  /** Nix and the index are in this image. */
  available: boolean;
  index: IndexState;
  release: string | null;
  /** The commit the pin names, and the one the baked index was built from. */
  pinCommit: string | null;
  indexCommit: string | null;
}

export interface InstalledApp {
  /** The profile element's name, which removing takes. */
  name: string;
  /** The nixpkgs attribute it came from. */
  attr: string;
  version: string;
}

export type JobAction = 'install' | 'remove' | 'free-space';

export interface Job {
  id: number;
  action: JobAction;
  /** The attribute installed, the element removed, or empty. */
  target: string;
  state: 'running' | 'done' | 'failed';
  log: string;
  startedAt: number;
  finishedAt: number | null;
  /** A sentence, when it failed. */
  error: string | null;
}

export interface Launcher {
  id: string;
  name: string;
  comment: string;
  hasIcon: boolean;
}

/** A launcher's id: its desktop file's name, without `.desktop`. */
const LAUNCHER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Icon sizes in hicolor, largest first; `scalable` holds SVGs. */
const ICON_DIRS = [
  'scalable',
  '512x512',
  '256x256',
  '192x192',
  '128x128',
  '96x96',
  '64x64',
  '48x48',
  '32x32',
  '24x24',
  '16x16',
];

/**
 * Linux apps from Nix: the pinned release's package list, searched locally;
 * installs and removals in the user's profile, one at a time; the store's
 * size and a garbage collection; and Start entries from the `.desktop`
 * files the installed apps ship, launched into the clicking tab's session.
 *
 * Every Nix command runs with `execFile` or `spawn` and an argument array,
 * never a shell, and a package name reaches one only after it was found in
 * the index. Anything that changes the profile, or starts an app, comes only
 * from a tab whose desktop session is live (owner, 2026-11-03): the tab that
 * holds the session the app will show in.
 */
@Injectable()
export class LinuxAppsService implements OnModuleDestroy {
  private readonly logger = new Logger(LinuxAppsService.name);
  /** From the image's environment; a test points it elsewhere. */
  paths: LinuxAppsPaths | null = linuxAppsPaths();
  private rows: PackageRow[] | null = null;
  private building: Promise<PackageRow[]> | null = null;
  private indexError: string | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private job: Job | null = null;
  private jobChild: ChildProcess | null = null;
  private nextJobId = 1;
  private storeSize: { bytes: number; at: number } | null = null;

  constructor(
    private readonly wayland: WaylandGateway,
    private readonly sessionApps: SessionApps,
  ) {}

  onModuleDestroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.killJob();
  }

  // ── The index ─────────────────────────────────────────────────────

  private async readCommits(): Promise<{
    release: string | null;
    pin: string | null;
    index: string | null;
  }> {
    const p = this.paths;
    if (!p) return { release: null, pin: null, index: null };
    const pin = parsePin(await fs.readFile(p.pinFile, 'utf8').catch(() => ''));
    const index = (
      await fs
        .readFile(join(p.indexDir, 'git-revision'), 'utf8')
        .catch(() => '')
    ).trim();
    return {
      release: pin.NIXPKGS_RELEASE || null,
      pin: pin.NIXPKGS_COMMIT || null,
      index: index || null,
    };
  }

  async status(): Promise<LinuxAppsStatus> {
    const c = await this.readCommits();
    const available =
      !!this.paths && existsSync(join(this.paths.indexDir, 'packages.json.br'));
    let index: IndexState;
    if (!available || !c.index || !c.pin) index = 'missing';
    else if (c.index !== c.pin) index = 'mismatch';
    else if (this.rows) index = 'ready';
    else if (this.indexError) index = 'failed';
    else {
      index = 'building';
      void this.ensureIndex().catch(() => undefined);
    }
    return {
      available,
      index,
      release: c.release,
      pinCommit: c.pin,
      indexCommit: c.index,
    };
  }

  /**
   * The rows, from memory, from the compact copy on the /nix volume, or
   * built from the release's list (a few seconds, once per pin).
   */
  async ensureIndex(): Promise<PackageRow[]> {
    this.touchIndex();
    if (this.rows) return this.rows;
    if (this.building) return this.building;
    const p = this.paths;
    if (!p) throw new NotFoundException('Linux apps are not available here');
    this.building = (async () => {
      const c = await this.readCommits();
      if (!c.index || !c.pin)
        throw new NotFoundException('The package list is not in this image');
      if (c.index !== c.pin)
        throw new ConflictException(
          `The package list is from ${c.index.slice(0, 12)}, but the pin is ${c.pin.slice(0, 12)}`,
        );
      const cached = join(p.cacheDir, `index-${c.index}.json`);
      try {
        const rows = JSON.parse(
          await fs.readFile(cached, 'utf8'),
        ) as PackageRow[];
        if (Array.isArray(rows)) return rows;
      } catch {
        // Not made yet, or damaged: make it.
      }
      const started = Date.now();
      const rows = await buildIndex(join(p.indexDir, 'packages.json.br'));
      this.logger.log(
        `Package index built: ${rows.length} packages in ${Date.now() - started} ms`,
      );
      await fs.mkdir(p.cacheDir, { recursive: true });
      const tmp = `${cached}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(rows));
      await fs.rename(tmp, cached);
      // Older pins' copies go.
      for (const f of await fs.readdir(p.cacheDir)) {
        if (f.startsWith('index-') && f !== basename(cached))
          await fs.rm(join(p.cacheDir, f), { force: true });
      }
      return rows;
    })();
    try {
      this.rows = await this.building;
      this.indexError = null;
      return this.rows;
    } catch (err) {
      this.indexError = (err as Error).message;
      throw err;
    } finally {
      this.building = null;
    }
  }

  /** The index is large in memory; it goes when nobody has searched for a while. */
  private touchIndex(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.rows = null;
    }, INDEX_IDLE_MS);
    this.idleTimer.unref();
  }

  async search(query: string): Promise<SearchResult[]> {
    const rows = await this.ensureIndex();
    return searchIndex(rows, query.slice(0, 100), SEARCH_LIMIT);
  }

  // ── The profile ──────────────────────────────────────────────────

  private nixEnv(): NodeJS.ProcessEnv {
    return childEnv();
  }

  async installed(): Promise<InstalledApp[]> {
    if (!this.paths) return [];
    let stdout: string;
    try {
      ({ stdout } = await run('nix', ['profile', 'list', '--json'], {
        env: this.nixEnv(),
        maxBuffer: 16 * 1024 * 1024,
        timeout: 60_000,
      }));
    } catch {
      return [];
    }
    return parseProfileList(stdout);
  }

  getJob(): Job | null {
    return this.job;
  }

  private requireSession(session: unknown): string {
    if (!isValidSessionId(session) || !this.wayland.hasSession(session)) {
      throw new ConflictException(
        'Linux apps are installed and started from a desktop tab whose session is open. Reload this tab and try again.',
      );
    }
    return session;
  }

  private requireNoJob(): void {
    if (this.job?.state === 'running')
      throw new ConflictException(
        'Another install or removal is running. Wait for it to finish.',
      );
  }

  async install(attr: unknown, session: unknown): Promise<Job> {
    this.requireSession(session);
    this.requireNoJob();
    if (!isValidAttr(attr))
      throw new BadRequestException('That is not a package name');
    const rows = await this.ensureIndex();
    const row = rows.find((r) => r[0] === attr);
    if (!row)
      throw new BadRequestException(
        `There is no package ${attr} in this release's list`,
      );
    const args = ['profile', 'add'];
    // Unfree packages need the environment's permission, which Nix reads only
    // when impure.
    if (row[4] === 1) args.push('--impure');
    args.push(`nixpkgs#${attr}`);
    return this.startJob('install', attr, args);
  }

  async remove(name: unknown, session: unknown): Promise<Job> {
    this.requireSession(session);
    this.requireNoJob();
    if (typeof name !== 'string' || name === '')
      throw new BadRequestException('Which app?');
    const installed = await this.installed();
    if (!installed.some((a) => a.name === name))
      throw new NotFoundException(`${name} is not installed`);
    return this.startJob('remove', name, ['profile', 'remove', name]);
  }

  freeSpace(session: unknown): Job {
    this.requireSession(session);
    this.requireNoJob();
    return this.startJob('free-space', '', null);
  }

  private startJob(
    action: JobAction,
    target: string,
    nixArgs: string[] | null,
  ): Job {
    const job: Job = {
      id: this.nextJobId++,
      action,
      target,
      state: 'running',
      log: '',
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    };
    this.job = job;
    const [cmd, args] = nixArgs
      ? ['nix', nixArgs]
      : ['nix-collect-garbage', ['-d']];
    job.log = `$ ${cmd} ${args.join(' ')}\n`;
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, {
        env: this.nixEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        // Its own group, so a timeout stops everything it started.
        detached: true,
      });
    } catch (err) {
      this.finishJob(job, (err as Error).message);
      return job;
    }
    this.jobChild = child;
    const append = (chunk: Buffer) => {
      job.log += chunk.toString('utf8');
      if (job.log.length > LOG_MAX)
        job.log = job.log.slice(job.log.length - LOG_MAX);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const timer = setTimeout(() => {
      append(Buffer.from('\nStopped: it ran past 30 minutes.\n'));
      this.killJob();
    }, JOB_TIMEOUT_MS);
    timer.unref();
    child.on('error', (err) => {
      clearTimeout(timer);
      this.finishJob(job, `cannot run ${cmd}: ${err.message}`);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      this.finishJob(
        job,
        code === 0
          ? null
          : signal
            ? `${cmd} was stopped (${signal})`
            : `${cmd} exited with ${code}`,
      );
    });
    return job;
  }

  private finishJob(job: Job, error: string | null): void {
    if (job.state !== 'running') return;
    job.state = error ? 'failed' : 'done';
    job.error = error;
    job.finishedAt = Date.now();
    this.jobChild = null;
    this.storeSize = null;
  }

  private killJob(): void {
    const child = this.jobChild;
    if (child?.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  }

  /** The store's size in bytes, measured with `du`. */
  async storeBytes(): Promise<number | null> {
    if (!this.paths) return null;
    if (this.storeSize && Date.now() - this.storeSize.at < STORE_SIZE_TTL_MS)
      return this.storeSize.bytes;
    try {
      const { stdout } = await run('du', ['-sk', this.paths.store], {
        env: childEnv(),
        timeout: 120_000,
      });
      const kb = Number(stdout.split(/\s/)[0]);
      if (!Number.isFinite(kb)) return null;
      this.storeSize = { bytes: kb * 1024, at: Date.now() };
      return this.storeSize.bytes;
    } catch {
      return null;
    }
  }

  // ── Start entries ────────────────────────────────────────────────

  private applicationsDir(): string | null {
    return this.paths
      ? join(this.paths.profile, 'share', 'applications')
      : null;
  }

  async launchers(): Promise<Launcher[]> {
    const dir = this.applicationsDir();
    if (!dir) return [];
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const out: Launcher[] = [];
    for (const f of files.sort()) {
      if (!f.endsWith('.desktop')) continue;
      const id = f.slice(0, -'.desktop'.length);
      if (!LAUNCHER_ID.test(id)) continue;
      const entry = parseDesktopEntry(
        await fs.readFile(join(dir, f), 'utf8').catch(() => ''),
      );
      if (!entry || !execArgv(entry.exec)) continue;
      out.push({
        id,
        name: entry.name,
        comment: entry.comment,
        hasIcon: (await this.iconFile(entry.icon)) !== null,
      });
    }
    return out;
  }

  private async entry(id: string) {
    const dir = this.applicationsDir();
    if (!dir || !LAUNCHER_ID.test(id)) return null;
    return parseDesktopEntry(
      await fs.readFile(join(dir, `${id}.desktop`), 'utf8').catch(() => ''),
    );
  }

  /**
   * An icon by name from the profile's hicolor theme, the largest there is,
   * or an absolute path inside the store. Never a file elsewhere.
   */
  private async iconFile(icon: string): Promise<string | null> {
    if (!this.paths || !icon) return null;
    const store = await fs
      .realpath(this.paths.store)
      .catch(() => this.paths!.store);
    const inStore = async (path: string) => {
      const real = await fs.realpath(path).catch(() => null);
      return real &&
        (real.startsWith(store + '/') || real.startsWith('/nix/store/'))
        ? real
        : null;
    };
    if (icon.startsWith('/')) {
      const ext = extname(icon).toLowerCase();
      return ext === '.png' || ext === '.svg' ? inStore(icon) : null;
    }
    if (!/^[A-Za-z0-9._+-]+$/.test(icon)) return null;
    const themes = join(this.paths.profile, 'share', 'icons', 'hicolor');
    for (const size of ICON_DIRS) {
      for (const ext of size === 'scalable' ? ['.svg'] : ['.png']) {
        const found = await inStore(join(themes, size, 'apps', icon + ext));
        if (found) return found;
      }
    }
    for (const ext of ['.svg', '.png']) {
      const found = await inStore(
        join(this.paths.profile, 'share', 'pixmaps', icon + ext),
      );
      if (found) return found;
    }
    return null;
  }

  async icon(id: string): Promise<{ path: string; type: string }> {
    const entry = await this.entry(id);
    const path = entry ? await this.iconFile(entry.icon) : null;
    if (!path) throw new NotFoundException('No icon');
    return {
      path,
      type: path.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
    };
  }

  /**
   * Start a launcher's app in the clicking tab's session: its `Exec`, with
   * the field codes removed, in its own process group (the session's end
   * stops the group), with the Terminal's environment for Linux apps.
   */
  async launch(id: string, session: unknown): Promise<{ pid: number }> {
    const sid = this.requireSession(session);
    const entry = await this.entry(id);
    const argv = entry ? execArgv(entry.exec) : null;
    if (!entry || !argv) throw new NotFoundException('No such Linux app');
    const env = terminalEnv(childEnv(), sid);
    const child = spawn(argv[0], argv.slice(1), {
      env,
      cwd: resolve(env.HOME ?? '/'),
      stdio: 'ignore',
      detached: true,
    });
    const pid = await new Promise<number>((ok, fail) => {
      child.once('spawn', () => ok(child.pid!));
      child.once('error', (err) =>
        fail(
          new BadRequestException(`Cannot start ${entry.name}: ${err.message}`),
        ),
      );
    });
    child.unref();
    // Its group ends with the session, and freezes under the cover screen.
    this.sessionApps.record(sid, pid);
    child.once('exit', () => this.sessionApps.exited(sid, pid));
    this.logger.log(
      `Started ${entry.name} (${id}) in a session's display, group ${pid}`,
    );
    return { pid };
  }
}

/**
 * `nix profile list --json`: `{"elements": {"<name>": {"attrPath",
 * "storePaths", ...}}}` (Nix 2.31). Elements without an attribute path
 * (installed from a store path) are listed under their name.
 */
export function parseProfileList(json: string): InstalledApp[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const elements = (parsed as { elements?: unknown })?.elements;
  if (!elements || typeof elements !== 'object') return [];
  const out: InstalledApp[] = [];
  for (const [name, raw] of Object.entries(
    elements as Record<string, unknown>,
  )) {
    const e = raw as { attrPath?: unknown; storePaths?: unknown };
    const attrPath = typeof e.attrPath === 'string' ? e.attrPath : '';
    const attr =
      attrPath.replace(/^(legacyPackages|packages)\.[^.]+\./, '') || name;
    const store =
      Array.isArray(e.storePaths) && typeof e.storePaths[0] === 'string'
        ? e.storePaths[0]
        : '';
    // /nix/store/<hash>-<name>-<version>
    const version = /-(\d[^-]*)$/.exec(basename(store))?.[1] ?? '';
    out.push({ name, attr, version });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
