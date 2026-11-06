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
import { OomKills, raiseOomScore, REAPPLY_OOM_SCORE_AFTER_MS } from './oom';
import { closureSpeaksX11 } from './xwayland';
import { WaylandGateway } from '../wayland/wayland.gateway';
import { SessionApps } from '../wayland/session-apps';
import { execArgv, parseDesktopEntry, pickLocalized } from './desktop-entry';
import {
  linuxAppsPaths,
  parsePin,
  pinIndexDir,
  pinStateFile,
  xwaylandBinary,
  type LinuxAppsPaths,
} from './linux-apps.paths';
import {
  buildIndex,
  isValidAttr,
  searchIndex,
  type PackageRow,
  type SearchResult,
} from './package-index';
import {
  effectivePin,
  imagePin,
  readPinState,
  type Pin,
  type PinState,
} from './pins';

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
  /** Installed from `nixpkgs#…`, so it follows the pin when the pin moves. */
  nixpkgs: boolean;
}

export type JobAction =
  | 'install'
  | 'remove'
  | 'free-space'
  | 'check'
  | 'update'
  | 'upgrade'
  | 'go-back';

export interface Job {
  id: number;
  action: JobAction;
  /** The attribute installed, the element removed, the snapshot moved to, or empty. */
  target: string;
  state: 'running' | 'done' | 'failed';
  /** What a job of several steps is doing now. */
  phase: string | null;
  log: string;
  startedAt: number;
  finishedAt: number | null;
  /** A sentence, when it failed. */
  error: string | null;
}

/** What a job's body runs its steps with. */
export interface JobSteps {
  job: Job;
  /** A command, its output in the job's log; rejects when it fails. */
  run(cmd: string, args: string[]): Promise<void>;
  log(text: string): void;
  /** Names the step the job is on, in its log and in `job.phase`. */
  phase(text: string): void;
}

/** The pins as the service reads them on each call. */
export interface PinsNow {
  /** `nixpkgs-pin.env` as the image installed it. */
  pinFile: Record<string, string>;
  image: Pin | null;
  state: PinState;
  /** The pin Nix installs from, or null when the image's pin file is incomplete. */
  effective: Pin | null;
  fromImage: boolean;
  /** Where the effective pin's package list is. */
  indexDir: string;
}

export interface Launcher {
  id: string;
  /** In the first of the browser's languages the entry has, else the plain one. */
  name: string;
  comment: string;
  hasIcon: boolean;
  /** Its desktop actions (Firefox's New Window), named the same way. */
  actions: { id: string; name: string }[];
}

/** A launcher's id: its desktop file's name, without `.desktop`. */
const LAUNCHER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** A desktop action's id, as the spec allows them. */
const ACTION_ID = /^[A-Za-z0-9-]{1,128}$/;

/** A browser language tag, loosely: BCP 47's letters, digits and dashes. */
const LANGUAGE_TAG = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8}){0,4}$/;

/**
 * The browser's languages, as the desktop sends them (`ro-RO,ro,en`): the
 * well-formed ones, at most ten. Anything else reads as no preference.
 */
export function parseLanguages(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => LANGUAGE_TAG.test(t))
    .slice(0, 10);
}

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
  /** Counts moves of the pin, so a list read before one isn't kept after it. */
  private indexEpoch = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private job: Job | null = null;
  private jobChild: ChildProcess | null = null;
  private nextJobId = 1;
  private storeSize: { bytes: number; at: number } | null = null;

  /** Out-of-memory kills in the container, to tell why an app died. */
  private readonly oomKills = new OomKills();

  constructor(
    private readonly wayland: WaylandGateway,
    private readonly sessionApps: SessionApps,
  ) {}

  onModuleDestroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.killJob();
  }

  // ── The index ─────────────────────────────────────────────────────

  /** The image's pin, the state file, and which of them Nix installs from. */
  async pins(): Promise<PinsNow | null> {
    const p = this.paths;
    if (!p) return null;
    const values = parsePin(
      await fs.readFile(p.pinFile, 'utf8').catch(() => ''),
    );
    const image = imagePin(values);
    const state = await readPinState(pinStateFile(p));
    const { pin, fromImage } = effectivePin(image, state);
    return {
      pinFile: values,
      image,
      state,
      effective: pin,
      fromImage,
      indexDir: fromImage || !pin ? p.indexDir : pinIndexDir(p, pin.commit),
    };
  }

  private async readCommits(): Promise<{
    release: string | null;
    pin: string | null;
    index: string | null;
    indexDir: string | null;
  }> {
    const pins = await this.pins();
    if (!pins) return { release: null, pin: null, index: null, indexDir: null };
    const index = (
      await fs
        .readFile(join(pins.indexDir, 'git-revision'), 'utf8')
        .catch(() => '')
    ).trim();
    // An image pin file without a snapshot name still names a commit.
    return {
      release:
        pins.effective?.release ?? (pins.pinFile.NIXPKGS_RELEASE || null),
      pin: pins.effective?.commit ?? (pins.pinFile.NIXPKGS_COMMIT || null),
      index: index || null,
      indexDir: pins.indexDir,
    };
  }

  async status(): Promise<LinuxAppsStatus> {
    const c = await this.readCommits();
    const available =
      !!this.paths && existsSync(join(this.paths.indexDir, 'packages.json.br'));
    let index: IndexState;
    if (
      !available ||
      !c.index ||
      !c.pin ||
      !c.indexDir ||
      !existsSync(join(c.indexDir, 'packages.json.br'))
    )
      index = 'missing';
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
      return this.loadRows(c.index, c.indexDir!);
    })();
    const epoch = this.indexEpoch;
    try {
      const rows = await this.building;
      // A move while it was read: the next call reads the new pin's.
      if (epoch !== this.indexEpoch) return rows;
      this.rows = rows;
      this.indexError = null;
      return rows;
    } catch (err) {
      this.indexError = (err as Error).message;
      throw err;
    } finally {
      this.building = null;
    }
  }

  /**
   * A pin's rows: the compact copy on the /nix volume, or built from the
   * pin's `packages.json.br` (a few seconds) and kept as one.
   */
  private async loadRows(commit: string, dir: string): Promise<PackageRow[]> {
    const p = this.paths!;
    const cached = join(p.cacheDir, `index-${commit}.json`);
    try {
      const rows = JSON.parse(
        await fs.readFile(cached, 'utf8'),
      ) as PackageRow[];
      if (Array.isArray(rows)) return rows;
    } catch {
      // Not made yet, or damaged: make it.
    }
    const started = Date.now();
    const rows = await buildIndex(join(dir, 'packages.json.br'));
    this.logger.log(
      `Package index built: ${rows.length} packages in ${Date.now() - started} ms`,
    );
    await fs.mkdir(p.cacheDir, { recursive: true });
    const tmp = `${cached}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows));
    await fs.rename(tmp, cached);
    return rows;
  }

  /**
   * The rows of any pin the machine keeps (the current one, the previous
   * one, or one a check found), for comparing versions.
   */
  async rowsFor(commit: string): Promise<PackageRow[]> {
    const pins = await this.pins();
    if (!pins) throw new NotFoundException('Linux apps are not available here');
    if (commit === pins.effective?.commit) return this.ensureIndex();
    const dir =
      commit === pins.image?.commit
        ? this.paths!.indexDir
        : pinIndexDir(this.paths!, commit);
    return this.loadRows(commit, dir);
  }

  /** After a move: the next search reads the new pin's list. */
  invalidateIndex(): void {
    this.indexEpoch++;
    this.rows = null;
    this.indexError = null;
  }

  /**
   * Only the pins the machine keeps keep their lists: the current and the
   * previous one, and what the last check found. Older ones go.
   */
  async pruneIndexes(): Promise<void> {
    const p = this.paths;
    const pins = await this.pins();
    if (!p || !pins) return;
    const keep = new Set(
      [
        pins.effective?.commit,
        pins.state.previous?.commit,
        pins.state.update?.commit,
        pins.state.upgrade?.commit,
      ].filter((c): c is string => !!c),
    );
    for (const f of await fs.readdir(p.cacheDir).catch(() => [] as string[])) {
      const m = /^index-([0-9a-f]{40})\.json$/.exec(f);
      if (m && !keep.has(m[1]))
        await fs.rm(join(p.cacheDir, f), { force: true });
    }
    const pinsDir = join(p.cacheDir, 'pins');
    for (const f of await fs.readdir(pinsDir).catch(() => [] as string[])) {
      if (!keep.has(f))
        await fs.rm(join(pinsDir, f), { recursive: true, force: true });
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

  requireSession(session: unknown): string {
    if (!isValidSessionId(session) || !this.wayland.hasSession(session)) {
      throw new ConflictException(
        'Linux apps are installed and started from a desktop tab whose session is open. Reload this tab and try again.',
      );
    }
    return session;
  }

  requireNoJob(): void {
    if (this.job?.state === 'running')
      throw new ConflictException(
        this.job.action === 'install' ||
          this.job.action === 'remove' ||
          this.job.action === 'free-space'
          ? 'Another install or removal is running. Wait for it to finish.'
          : 'An update is running. Wait for it to finish.',
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
    return this.runJob('install', attr, async (steps) => {
      await steps.run('nix', args);
      await this.xwaylandSteps(steps);
    });
  }

  async remove(name: unknown, session: unknown): Promise<Job> {
    this.requireSession(session);
    this.requireNoJob();
    if (typeof name !== 'string' || name === '')
      throw new BadRequestException('Which app?');
    const installed = await this.installed();
    if (!installed.some((a) => a.name === name))
      throw new NotFoundException(`${name} is not installed`);
    return this.runJob('remove', name, async (steps) => {
      await steps.run('nix', ['profile', 'remove', name]);
      await this.xwaylandSteps(steps);
    });
  }

  /** The step an install, a removal or a Go back ends with. */
  async xwaylandSteps(steps: JobSteps): Promise<void> {
    const next = await this.xwaylandStep(steps.job);
    if (next) await steps.run('nix', next);
  }

  /**
   * Xwayland comes with the first app that speaks X11 (its closure holds
   * libX11) and goes with the last, in a profile of its own. Alone it is
   * 421 MiB unpacked, but about 5 MiB beside a GTK app such as Firefox, so
   * the image doesn't carry it (decisions-linux-apps-built.md). The command
   * for that, or null when Xwayland stays as it is.
   */
  private async xwaylandStep(job: Job): Promise<string[] | null> {
    const p = this.paths;
    if (!p) return null;
    const wanted = await this.profileSpeaksX11();
    if (wanted === null) return null;
    const installed = existsSync(xwaylandBinary(p));
    if (wanted && !installed) {
      job.log += '\nAn installed app speaks X11, so Xwayland comes with it.\n';
      return [
        'profile',
        'add',
        '--profile',
        p.xwaylandProfile,
        'nixpkgs#xwayland',
      ];
    }
    if (!wanted && installed) {
      job.log += '\nNo installed app speaks X11 any more, so Xwayland goes.\n';
      return ['profile', 'remove', '--profile', p.xwaylandProfile, '--all'];
    }
    return null;
  }

  /** Whether the user's profile holds libX11; null when it can't be read. */
  private async profileSpeaksX11(): Promise<boolean | null> {
    const p = this.paths;
    if (!p) return null;
    const target = await fs.realpath(p.profile).catch(() => null);
    if (!target) return false;
    try {
      const { stdout } = await run(
        'nix',
        ['path-info', '--recursive', target],
        {
          env: this.nixEnv(),
          maxBuffer: 16 * 1024 * 1024,
          timeout: 60_000,
        },
      );
      return closureSpeaksX11(stdout);
    } catch {
      return null;
    }
  }

  freeSpace(session: unknown): Job {
    this.requireSession(session);
    this.requireNoJob();
    return this.runJob('free-space', '', (steps) =>
      steps.run('nix-collect-garbage', ['-d']),
    );
  }

  /**
   * Run a job: `body` runs its commands through `steps`, one at a time, each
   * one's output in the job's log. The job fails with the first error.
   * Only one job runs at a time; callers check `requireNoJob` first.
   */
  runJob(
    action: JobAction,
    target: string,
    body: (steps: JobSteps) => Promise<void>,
  ): Job {
    const job: Job = {
      id: this.nextJobId++,
      action,
      target,
      state: 'running',
      phase: null,
      log: '',
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    };
    this.job = job;
    const steps: JobSteps = {
      job,
      run: (cmd, args) =>
        new Promise<void>((ok, fail) =>
          this.runStep(job, cmd, args, (error) =>
            error ? fail(new Error(error)) : ok(),
          ),
        ),
      log: (text) => appendLog(job, text),
      phase: (text) => {
        job.phase = text;
        appendLog(job, `${job.log ? '\n' : ''}${text}\n`);
      },
    };
    body(steps).then(
      () => this.finishJob(job, null),
      (err: Error) => this.finishJob(job, err.message),
    );
    return job;
  }

  /** One command of a job, its output in the job's log. */
  private runStep(
    job: Job,
    cmd: string,
    args: string[],
    done: (error: string | null) => void,
  ): void {
    job.log += `$ ${cmd} ${args.join(' ')}\n`;
    let child: ChildProcess;
    try {
      child = spawn(cmd, args, {
        env: this.nixEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        // Its own group, so a timeout stops everything it started.
        detached: true,
      });
    } catch (err) {
      done((err as Error).message);
      return;
    }
    this.jobChild = child;
    const append = (chunk: Buffer) => appendLog(job, chunk.toString('utf8'));
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const timer = setTimeout(() => {
      append(Buffer.from('\nStopped: it ran past 30 minutes.\n'));
      this.killJob();
    }, JOB_TIMEOUT_MS);
    timer.unref();
    // A failed spawn emits 'error' and may still emit 'close': one answer.
    let answered = false;
    const answer = (error: string | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      if (this.jobChild === child) this.jobChild = null;
      done(error);
    };
    child.on('error', (err) => answer(`cannot run ${cmd}: ${err.message}`));
    child.on('close', (code, signal) =>
      answer(
        code === 0
          ? null
          : signal
            ? `${cmd} was stopped (${signal})`
            : `${cmd} exited with ${code}`,
      ),
    );
  }

  private finishJob(job: Job, error: string | null): void {
    if (job.state !== 'running') return;
    job.state = error ? 'failed' : 'done';
    job.phase = null;
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

  /**
   * Start's Linux entries, named in the first of `languages` (the browser's,
   * which the desktop sends) that each entry has. An action whose `Exec`
   * names no program is left out, as an entry is.
   */
  async launchers(languages: readonly string[] = []): Promise<Launcher[]> {
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
        name: pickLocalized(entry.name, entry.names, languages),
        comment: pickLocalized(entry.comment, entry.comments, languages),
        hasIcon: (await this.iconFile(entry.icon)) !== null,
        actions: entry.actions
          .filter((a) => execArgv(a.exec))
          .map((a) => ({
            id: a.id,
            name: pickLocalized(a.name, a.names, languages),
          })),
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
   * Start a launcher's app in the clicking tab's session: its `Exec`, or one
   * of its desktop actions' (`action`), with the field codes removed, in its
   * own process group (the session's end stops the group), with the
   * Terminal's environment for Linux apps.
   */
  async launch(
    id: string,
    session: unknown,
    action?: string,
  ): Promise<{ pid: number }> {
    const sid = this.requireSession(session);
    const entry = await this.entry(id);
    if (!entry) throw new NotFoundException('No such Linux app');
    let exec = entry.exec;
    if (action !== undefined) {
      const found = ACTION_ID.test(action)
        ? entry.actions.find((a) => a.id === action)
        : undefined;
      if (!found)
        throw new NotFoundException(`${entry.name} has no such action`);
      exec = found.exec;
    }
    const argv = execArgv(exec);
    if (!argv) throw new NotFoundException('No such Linux app');
    const env = terminalEnv(childEnv(), sid, this.wayland.x11Display(sid));
    const child = spawn(argv[0], argv.slice(1), {
      env,
      cwd: resolve(env.HOME ?? '/'),
      stdio: 'ignore',
      detached: true,
    });
    const pid = await new Promise<number>((ok, fail) => {
      child.once('spawn', () => {
        // Before it forks its own processes, which inherit the score.
        raiseOomScore(child.pid!);
        ok(child.pid!);
      });
      child.once('error', (err) =>
        fail(
          new BadRequestException(`Cannot start ${entry.name}: ${err.message}`),
        ),
      );
    });
    child.unref();
    // Its group ends with the session, and freezes under the cover screen.
    this.sessionApps.record(sid, pid);
    // Firefox (and apps like it) sets its own main process's score back to
    // 0 while it starts, which ties it with the backend; once it is up, the
    // score stays where it is put. Its content processes keep the ones
    // Firefox gives them.
    const reRaise = REAPPLY_OOM_SCORE_AFTER_MS.map((ms) =>
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          raiseOomScore(pid);
      }, ms).unref(),
    );
    child.once('exit', (_code, signal) => {
      for (const t of reRaise) clearTimeout(t);
      this.sessionApps.exited(sid, pid);
      // Killed by the kernel for memory: its windows have gone, say why.
      if (signal === 'SIGKILL' && this.oomKills.happened()) {
        this.wayland.sendToTab(sid, {
          type: 'app_stopped',
          app: entry.name,
          reason: 'memory',
        });
      }
    });
    this.logger.log(
      `Started ${entry.name} (${id}) in a session's display, group ${pid}`,
    );
    return { pid };
  }
}

/** Adds to a job's log, keeping its end. */
function appendLog(job: Job, text: string): void {
  job.log += text;
  if (job.log.length > LOG_MAX)
    job.log = job.log.slice(job.log.length - LOG_MAX);
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
    const e = raw as {
      attrPath?: unknown;
      storePaths?: unknown;
      originalUrl?: unknown;
    };
    const attrPath = typeof e.attrPath === 'string' ? e.attrPath : '';
    const attr =
      attrPath.replace(/^(legacyPackages|packages)\.[^.]+\./, '') || name;
    const store =
      Array.isArray(e.storePaths) && typeof e.storePaths[0] === 'string'
        ? e.storePaths[0]
        : '';
    // /nix/store/<hash>-<name>-<version>
    const version = /-(\d[^-]*)$/.exec(basename(store))?.[1] ?? '';
    out.push({
      name,
      attr,
      version,
      nixpkgs: e.originalUrl === 'flake:nixpkgs',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
