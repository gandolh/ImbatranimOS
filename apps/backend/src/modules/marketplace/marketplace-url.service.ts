import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join, posix } from 'path';

import type { Env } from '../../config/env.schema';
import { DbService } from '../../db/db.service';
import { parseManifest, type AppManifest } from './app-manifest';
import type { Descriptor } from './catalog';
import { manifestVersion, readManifestJson } from './manifest-file';
import {
  directorySize,
  exists,
  gitArgv,
  isDirectoryWithin,
  isInside,
  MarketplaceService,
  MAX_SERVED_BYTES,
  resolveServed,
  type InstalledRow,
  type MarketplaceApp,
  type StepRunner,
} from './marketplace.service';
import {
  NATIVE_MANIFEST_VERSION,
  parseNativeManifest,
} from './native-manifest';
import { PendingInspections } from './pending-inspections';
import { eachLine, runStep, type StepResult } from './run-step';
import { SandboxTokens } from './sandbox-tokens';
import {
  commitTipLines,
  deriveAppId,
  isCommitRefPath,
  lsRemotePatterns,
  parseSourceUrl,
  resolveRef,
  sourceUrl,
  SourceUrlError,
  type AppSource,
  type ParsedSourceUrl,
  type ResolvedRef,
} from './source-url';
import { TreeTally } from './tree-tally';

/** How long listing a repository's refs may take. */
const LS_REMOTE_TIMEOUT_MS = 60_000;
/** How long listing the fetched commit's files may take. Local: the objects are on disk. */
const LS_TREE_TIMEOUT_MS = 60_000;
/** The most a URL app's clone may hold, history and all. */
export const MAX_CLONE_BYTES = 512 * 1024 * 1024;
/** The most paths a URL app's commit may hold. Far more than a built app needs. */
export const MAX_CLONE_ENTRIES = 20_000;

/**
 * Contract B's `Inspection`: what the pane's consent card shows.
 *
 * `runtime` says how the app would run: `sandboxed` for a prebuilt (version 1)
 * manifest, `native` for one built from source (version 2). A native app is
 * `verified` when the OS's verified list names it at this commit; otherwise
 * installing it needs the owner's trust. For a native app, `manifest` sums up
 * its apps (the capabilities any of them asks for), and `apps` lists them.
 */
export interface Inspection {
  pending: string;
  id: string;
  runtime: 'sandboxed' | 'native';
  verified: boolean;
  /** A native app's build type: `service` runs a server of its own. */
  type?: Descriptor['type'];
  apps?: { id: string; name: string; icon: string; capabilities: string[] }[];
  manifest: Pick<
    AppManifest,
    | 'name'
    | 'description'
    | 'meta'
    | 'icon'
    | 'capabilities'
    | 'window'
    | 'minSystemVersion'
  >;
  source: AppSource;
  current: { commit: string } | null;
}

/**
 * Apps installed from a URL.
 *
 * A check (`inspect`) resolves the URL to a commit, clones it (measured
 * before its checkout, since nobody has agreed to anything yet), reads and
 * validates `imbatranim.json`, and holds the clone for the owner's answer.
 * The check takes its turn on the builds' queue.
 *
 * A version 2 manifest is an app built from source that runs natively, like
 * a catalog app (`native-manifest.ts`). It installs at once when the verified
 * list (`verified.ts`) names its repository at this commit; otherwise only
 * when the owner trusts this commit, since a native app acts as the owner.
 * `install` builds the checked clone in place with the catalog's installer.
 *
 * A version 1 manifest is the earlier prebuilt app, treated as potentially
 * malicious: nothing from it runs on the machine. The OS runs no install,
 * build or server; its code runs only in the browser, in an opaque-origin
 * frame, and its files are served only under a per-window token with the
 * sandbox's headers (`sandbox-headers.ts`). `install` keeps the clone.
 */
@Injectable()
export class MarketplaceUrlApps {
  private readonly logger = new Logger(MarketplaceUrlApps.name);
  /**
   * The frame's runtime (contract D), a sibling of this file in `src/` and in
   * `dist/`. Settable so a test can point it at a file of its own.
   */
  runtimePath = join(__dirname, 'sandbox', 'runtime.js');
  /** Read once and kept, and read again when the file changes (in development). */
  private runtimeCache: { mtimeMs: number; body: Buffer } | null = null;
  /**
   * The most a check's clone may hold ({@link MAX_CLONE_BYTES}, for the
   * history and for the files a checkout would write, each), and the most
   * paths its commit may list ({@link MAX_CLONE_ENTRIES}). Settable so a test
   * can make a repository too big without writing 512 MB.
   */
  cloneLimits = { bytes: MAX_CLONE_BYTES, entries: MAX_CLONE_ENTRIES };

  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly dbs: DbService,
    private readonly config: ConfigService<Env, true>,
    private readonly tokens: SandboxTokens,
    private readonly pendings: PendingInspections,
  ) {}

  // ── checking and installing ──────────────────────────────────────────────

  /**
   * Resolve a pasted URL, clone it and validate its manifest: 400 for a bad
   * URL, ref or manifest, 502 when the repository cannot be read, 504 when
   * that takes too long, 429 when `MAX_PENDING` checks are waiting.
   */
  async inspect(url: string): Promise<Inspection> {
    let parsed: ParsedSourceUrl;
    try {
      parsed = parseSourceUrl(url, {
        allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS'),
      });
    } catch (err) {
      throw asHttpError(err);
    }
    const release = this.pendings.reserve();
    try {
      return await this.marketplace.runQueued(() => this.check(parsed));
    } finally {
      release();
    }
  }

  private async check(parsed: ParsedSourceUrl): Promise<Inspection> {
    await this.marketplace.prepareDirs();
    const resolved = await this.resolve(parsed);
    const id = deriveAppId(parsed.repo, resolved.subdir);
    const source: AppSource = {
      url: sourceUrl(
        parsed.repo,
        // The default branch stays implicit in the URL, so an update follows
        // it even when it is renamed.
        parsed.refPath.length === 0 ? null : resolved.ref,
        resolved.subdir,
      ),
      repo: parsed.repo,
      ref: resolved.ref,
      commit: resolved.commit,
      subdir: resolved.subdir,
    };
    const buildId = `${resolved.commit.slice(0, 12)}-${randomBytes(4).toString('hex')}`;
    const dir = this.marketplace.buildDir(id, buildId);
    this.pendings.startCloning(dir);
    try {
      const { root, raw } = await this.cloneAndRead(dir, source);
      const row = this.marketplace.row(id);
      if (manifestVersion(raw) === NATIVE_MANIFEST_VERSION) {
        return this.checkedNative(id, buildId, dir, root, raw, source, row);
      }
      if (row?.runtime === 'native') {
        throw new ConflictException(
          `This app is installed to build from source. At ${source.commit.slice(0, 7)} it is prebuilt, which runs sandboxed: uninstall it first to install that.`,
        );
      }
      const { entry, manifest } = await this.validatePrebuilt(
        dir,
        root,
        raw,
        source,
      );
      // A damaged row is no installed commit to compare with; installing
      // over it writes a whole new row.
      const installed = this.marketplace.sandboxedRow(id);
      const pending = this.pendings.add({
        id,
        buildId,
        dir,
        root,
        entry,
        manifest,
        source,
      });
      return {
        pending,
        id,
        runtime: 'sandboxed',
        verified: false,
        manifest: {
          name: manifest.name,
          description: manifest.description,
          meta: manifest.meta,
          icon: manifest.icon,
          capabilities: manifest.capabilities,
          window: manifest.window,
          minSystemVersion: manifest.minSystemVersion,
        },
        source,
        current: installed ? { commit: installed.ref } : null,
      };
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true });
      throw err;
    } finally {
      this.pendings.stopCloning(dir);
    }
  }

  /**
   * A checked app built from source: its descriptor, and whether the verified
   * list names it at this commit. Held like a prebuilt one until the owner's
   * answer.
   */
  private checkedNative(
    id: string,
    buildId: string,
    dir: string,
    root: string,
    raw: unknown,
    source: AppSource,
    row: InstalledRow | undefined,
  ): Inspection {
    const parsed = parseNativeManifest(raw, source, {
      allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS'),
    });
    if (!parsed.ok) throw new BadRequestException(parsed.problem);
    const d = parsed.descriptor;
    const pending = this.pendings.add({
      id,
      buildId,
      dir,
      root,
      entry: '',
      source,
      native: { descriptor: d, manifest: raw },
    });
    const first = d.apps[0];
    const capabilities = [...new Set(d.apps.flatMap((a) => a.capabilities))];
    return {
      pending,
      id,
      runtime: 'native',
      verified: this.marketplace.isVerified(source),
      type: d.type,
      apps: d.apps.map((a) => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        capabilities: a.capabilities,
      })),
      manifest: {
        name: d.name,
        description: d.description,
        meta: first.meta,
        icon: d.apps.length === 1 ? first.icon : 'package',
        capabilities,
        window: first.window,
        minSystemVersion: d.minSystemVersion,
      },
      source,
      // A sandboxed install of the same app is replaced by this one.
      current: row ? { commit: row.ref } : null,
    };
  }

  /** The commit and subdirectory a parsed URL names, from `git ls-remote`. */
  private async resolve(parsed: ParsedSourceUrl): Promise<ResolvedRef> {
    try {
      // A commit must be a branch's or a tag's tip (see `resolveRef`), so
      // every branch and tag is listed, and only the lines about that commit
      // are kept: a repository may have thousands.
      const commit = isCommitRefPath(parsed.refPath);
      const args =
        parsed.refPath.length === 0
          ? ['ls-remote', '--symref', '--', parsed.repo, 'HEAD']
          : commit
            ? ['ls-remote', '--heads', '--tags', '--', parsed.repo]
            : [
                'ls-remote',
                '--',
                parsed.repo,
                ...lsRemotePatterns(parsed.refPath),
              ];
      const kept: string[] = [];
      const keep = commitTipLines(parsed.refPath[0] ?? '');
      const lines = eachLine((line) => {
        if (keep(line)) kept.push(line);
      });
      // ls-remote needs no repository, but git looks for one around its cwd
      // and would read that one's config, which the env's "no system or
      // global config" does not cover (in development, `data/apps` sits inside
      // the OS's own checkout). So: an empty directory of its own, and no
      // looking above it.
      const cwd = join(this.marketplace.appsDir(), '.cache', 'ls-remote');
      await fs.mkdir(cwd, { recursive: true, mode: 0o700 });
      const listed = await runStep(gitArgv(...args), {
        cwd,
        env: {
          ...this.marketplace.gitEnv(parsed.repo),
          GIT_CEILING_DIRECTORIES: dirname(cwd),
        },
        timeoutMs: LS_REMOTE_TIMEOUT_MS,
        ...(commit ? { onStdout: lines.onStdout } : {}),
      });
      if (!listed.ok || listed.stopped) {
        throw fetchFailure('Reading the branches', listed, parsed.repo);
      }
      lines.end();
      return resolveRef(
        commit ? kept.join('\n') : listed.output,
        parsed.refPath,
        parsed.repo,
      );
    } catch (err) {
      throw asHttpError(err);
    }
  }

  /**
   * Fetch the commit into `dir` (no install or build step yet) and check what
   * came: the clone's size and the subdirectory. Answers the app's folder in
   * the clone and its `imbatranim.json`, parsed as JSON but not validated.
   */
  private async cloneAndRead(
    dir: string,
    source: AppSource,
  ): Promise<{ root: string; raw: unknown }> {
    await fs.mkdir(dir, { recursive: true });
    const step: StepRunner = async (label, argv, cwd, env, timeoutMs) => {
      const result = await runStep(argv, { cwd, env, timeoutMs });
      if (!result.ok) throw fetchFailure(label, result, source.repo);
      return true;
    };
    await this.marketplace.fetchCommit(
      dir,
      source.repo,
      source.commit,
      step,
      (reason) => Promise.reject(new BadGatewayException(reason)),
      (gitEnv) => this.measureBeforeCheckout(dir, source, gitEnv),
    );

    // Checked again with the files out: what was measured before the
    // checkout, plus the history, must still fit. A clone this big is
    // deleted before anything else reads it.
    const { bytes } = this.cloneLimits;
    if ((await directorySize(dir, dir, bytes)) > bytes) {
      throw new BadRequestException(overClone(bytes));
    }

    const where = source.subdir
      ? `${source.subdir} in ${source.repo}`
      : source.repo;
    const rootRel = source.subdir ? posix.normalize(source.subdir) : '';
    const root = join(dir, rootRel);
    if (!(await isDirectoryWithin(dir, root))) {
      throw new BadRequestException(
        `${source.subdir} is not a folder in ${source.repo} at ${source.commit.slice(0, 7)}.`,
      );
    }
    const raw = await readManifestJson(root, where);
    return { root: rootRel === '.' ? '' : rootRel, raw };
  }

  /**
   * A prebuilt (version 1) app's manifest, validated, and its entry: a real
   * file inside the directory that would be served, which is not too big.
   */
  private async validatePrebuilt(
    dir: string,
    rootRel: string,
    raw: unknown,
    source: AppSource,
  ): Promise<{ entry: string; manifest: AppManifest }> {
    const where = source.subdir
      ? `${source.subdir} in ${source.repo}`
      : source.repo;
    const root = join(dir, rootRel);
    const realRoot = await fs.realpath(root);
    const parsed = parseManifest(raw);
    if (!parsed.ok) throw new BadRequestException(parsed.problem);
    const manifest = parsed.manifest;

    // ── the entry: a real file inside the directory that will be served ──
    const entry = posix.normalize(manifest.entry);
    let servedBytes: number;
    try {
      const servedRoot = await fs.realpath(join(root, posix.dirname(entry)));
      const realEntry = await fs.realpath(join(root, entry));
      if (!isInside(realRoot, servedRoot) || !isInside(servedRoot, realEntry)) {
        throw new Error('outside');
      }
      if (!(await fs.stat(realEntry)).isFile()) throw new Error('not a file');
      servedBytes = await directorySize(servedRoot, realRoot);
    } catch {
      throw new BadRequestException(
        `${manifest.entry} is not a file in ${where}. An app from a URL is not built on install: commit its built module.`,
      );
    }
    if (servedBytes > MAX_SERVED_BYTES) {
      throw new BadRequestException(
        `${posix.dirname(entry)} holds more than ${MAX_SERVED_BYTES / 1048576} MB, the most an app may serve.`,
      );
    }
    return { entry, manifest };
  }

  /**
   * Between the fetch and the checkout: refuse a commit whose checkout would
   * write more than the clone may hold. A pack of a few KB can expand to
   * hundreds of MB of files (one blob of zeros under many names), and the
   * check runs before the owner has agreed to anything, so this is measured
   * before a single file is written: the fetched history's size first, then
   * the tree's, from `git ls-tree`, every path's blob counted.
   */
  private async measureBeforeCheckout(
    dir: string,
    source: AppSource,
    gitEnv: NodeJS.ProcessEnv,
  ): Promise<boolean> {
    const limits = this.cloneLimits;
    const gitDir = join(dir, '.git');
    if ((await directorySize(gitDir, dir, limits.bytes)) > limits.bytes) {
      throw new BadRequestException(overClone(limits.bytes));
    }

    // The tree's blob sizes are what the checkout writes only when nothing
    // rewrites them on the way out. The repository's own .gitattributes could
    // (`ident` turns each 4-byte `$Id$` into 47 bytes; `eol=crlf` and
    // `working-tree-encoding` grow text too), and info/attributes outranks
    // it. No filter driver is configured (no system or global config), so
    // `-filter` only makes that explicit. The files come out byte for byte as
    // committed, which is what a prebuilt app wants anyway.
    await fs.mkdir(join(gitDir, 'info'), { recursive: true });
    await fs.writeFile(
      join(gitDir, 'info', 'attributes'),
      '* -text -eol -ident -filter -working-tree-encoding\n',
    );

    const tally = new TreeTally();
    const listed = await runStep(
      gitArgv('ls-tree', '-r', '-l', '-z', '--full-tree', 'FETCH_HEAD'),
      {
        cwd: dir,
        env: gitEnv,
        timeoutMs: LS_TREE_TIMEOUT_MS,
        onStdout: (chunk) => {
          tally.push(chunk);
          return tally.within(limits);
        },
      },
    );
    if (tally.entries > limits.entries) {
      throw new BadRequestException(
        `The repository holds more than ${limits.entries.toLocaleString('en-US')} files at that commit, the most an app from a URL may have.`,
      );
    }
    if (tally.bytes > limits.bytes) {
      throw new BadRequestException(
        `The files at that commit come to more than ${limits.bytes / 1048576} MB, the most an app from a URL may be.`,
      );
    }
    if (!listed.ok)
      throw fetchFailure('Listing the files', listed, source.repo);
    if (tally.malformed || tally.partial) {
      throw new BadGatewayException(
        `Listing the files from ${source.repo} failed: git's answer could not be read.`,
      );
    }
    return true;
  }

  /**
   * Install a checked app. 404 when the check is unknown or expired, 409 while
   * the app is being installed.
   *
   * One built from source is queued to build from the checked clone, and
   * answers with its listing (its job queued). Unless the verified list names
   * it at this commit, it needs `trust`: the owner's word for this commit,
   * kept as its trust record. Without it the answer is a 403.
   *
   * A prebuilt one is kept as it is: its row points at the clone, its other
   * builds go and its tokens are revoked, so a window still open on the old
   * build stops being served and reloads onto the new one.
   */
  async install(pending: string, trust = false): Promise<MarketplaceApp> {
    const gone = () =>
      new NotFoundException('That check has expired. Check the URL again.');
    const checked = this.pendings.get(pending);
    if (!checked) throw gone();
    if (this.marketplace.isInstalling(checked.id)) {
      throw new ConflictException(
        'It is being installed; wait for that to finish',
      );
    }
    if (checked.native) {
      // Read again now: the list could have changed since the check.
      const verified = this.marketplace.isVerified(checked.source);
      if (!verified && !trust) {
        throw new ForbiddenException(
          `${checked.native.descriptor.name} is not verified. Installing it at ${checked.source.commit.slice(0, 7)} needs your trust.`,
        );
      }
      if (!(await exists(join(checked.dir, checked.root)))) {
        await this.pendings.cancel(pending);
        throw gone();
      }
      if (this.pendings.get(pending) !== checked) throw gone();
      // Queued first, then taken, with nothing awaited between: if another
      // install of the app started meanwhile, this one is refused (409)
      // while the check still holds its clone, which Cancel or expiry
      // deletes.
      this.marketplace.installFromUrl(checked.id, {
        kind: 'url',
        d: checked.native.descriptor,
        manifest: checked.native.manifest,
        source: checked.source,
        trust: { by: verified ? 'verified' : 'owner', at: Date.now() },
        fetched: { dir: checked.dir, buildId: checked.buildId },
      });
      this.pendings.take(pending);
      this.logger.log(
        `Queued ${checked.id} from ${checked.source.url} at ${checked.source.commit} (${verified ? 'verified' : 'trusted by the owner'})`,
      );
      const [listed] = await this.marketplace.listed(checked.id);
      if (!listed) throw new InternalServerErrorException();
      return listed;
    }
    if (this.marketplace.row(checked.id)?.runtime === 'native') {
      await this.pendings.cancel(pending);
      throw new ConflictException(
        'This app is installed to build from source: uninstall it first to install its prebuilt version.',
      );
    }
    if (!(await exists(join(checked.dir, checked.root, checked.entry)))) {
      await this.pendings.cancel(pending);
      throw gone();
    }
    // Cancelled or expired while the file was looked at.
    if (this.pendings.get(pending) !== checked) throw gone();
    // A native install of the app that started meanwhile is building in a
    // directory of its own; this row would land under it.
    if (this.marketplace.isInstalling(checked.id)) {
      throw new ConflictException(
        'It is being installed; wait for that to finish',
      );
    }

    // From here to the row, nothing awaits: no clean-up can run in between
    // and take the clone, which stops being held by the check now.
    this.pendings.take(pending);
    this.dbs.db
      .prepare(
        `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, entries, installed_at, runtime, source, manifest)
         VALUES (@id, @ref, @build_id, @root, @entry, NULL, @installed_at, 'sandboxed', @source, @manifest)
         ON CONFLICT (id) DO UPDATE SET ref = excluded.ref, build_id = excluded.build_id,
           root = excluded.root, entry = excluded.entry, entries = NULL,
           installed_at = excluded.installed_at, runtime = excluded.runtime,
           source = excluded.source, manifest = excluded.manifest`,
      )
      .run({
        id: checked.id,
        ref: checked.source.commit,
        build_id: checked.buildId,
        root: checked.root,
        entry: checked.entry,
        installed_at: Date.now(),
        source: JSON.stringify(checked.source),
        manifest: JSON.stringify(checked.manifest),
      });
    this.tokens.revokeApp(checked.id);
    await this.marketplace.removeBuilds(checked.id, checked.buildId);
    this.logger.log(
      `Installed ${checked.id} from ${checked.source.url} at ${checked.source.commit}`,
    );
    const listed = await this.marketplace.urlApp(checked.id);
    if (!listed) throw new InternalServerErrorException();
    return listed;
  }

  /** Drop a check and its clone. Unknown is not an error: it may have expired. */
  cancel(pending: string): Promise<void> {
    return this.pendings.cancel(pending);
  }

  // ── the sandbox ──────────────────────────────────────────────────────────

  /**
   * Mint a window's token. 404 unless `id` is an installed URL app whose row
   * reads back by install's rules.
   */
  openSandbox(id: string): { path: string } {
    const row = this.marketplace.sandboxedRow(id);
    if (!row) throw new NotFoundException();
    const token = this.tokens.mint(id, row.build_id);
    return { path: `marketplace/sandbox/${token}/` };
  }

  closeSandbox(token: string): void {
    this.tokens.revoke(token);
  }

  /**
   * The installed app a token is for, or a 404. A token whose app was
   * uninstalled or moved to another build, or whose row no longer reads back
   * by install's rules, is revoked on the way: it can never serve again.
   */
  private grantedRow(token: string): InstalledRow {
    const grant = this.tokens.lookup(token);
    const row = grant ? this.marketplace.sandboxedRow(grant.appId) : null;
    if (!grant || !row || row.build_id !== grant.buildId) {
      if (grant) this.tokens.revoke(token);
      throw new NotFoundException();
    }
    return row;
  }

  /** The frame's document (contract B), naming the app's entry for the runtime. */
  shell(token: string): string {
    return sandboxShell(this.grantedRow(token).entry);
  }

  /** The runtime's source, or null when the file is missing (a broken deploy). */
  async runtime(token: string): Promise<Buffer | null> {
    this.grantedRow(token);
    try {
      const stat = await fs.stat(this.runtimePath);
      let cached = this.runtimeCache;
      if (cached?.mtimeMs !== stat.mtimeMs) {
        cached = {
          mtimeMs: stat.mtimeMs,
          body: await fs.readFile(this.runtimePath),
        };
        this.runtimeCache = cached;
      }
      return cached.body;
    } catch {
      this.logger.error(`The sandbox runtime is missing: ${this.runtimePath}`);
      return null;
    }
  }

  /** A file of the app's served directory, by the native route's rules. */
  file(token: string, segments: string[]): Promise<string> {
    const row = this.grantedRow(token);
    return resolveServed(this.marketplace.servedRoot(row), segments);
  }
}

/**
 * The frame's document. `content` is a URL relative to the document, so the
 * entry's file name is percent-encoded; that also leaves nothing in it that
 * could close the attribute.
 */
export function sandboxShell(entry: string): string {
  const src = `app/${encodeURIComponent(posix.basename(entry))}`;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta name="imb-entry" content="${src}">`,
    '<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}</style>',
    '<script type="module" src="runtime.js"></script></head><body></body></html>',
  ].join('\n');
}

/** The refusal of a clone over `bytes`, before or after its checkout. */
function overClone(bytes: number): string {
  return `The repository is over ${bytes / 1048576} MB at that commit, the most an app from a URL may be.`;
}

/** A refused URL or ref is the owner's to fix: 400. Anything already HTTP stays as it is. */
function asHttpError(err: unknown): unknown {
  if (err instanceof SourceUrlError)
    return new BadRequestException(err.message);
  return err;
}

/** A git command that failed against the repository: 504 past its deadline, 502 otherwise. */
function fetchFailure(
  label: string,
  result: StepResult,
  repo: string,
): HttpException {
  if (result.timedOut) {
    return new GatewayTimeoutException(
      `${label} from ${repo} took too long. Try again later.`,
    );
  }
  const lines = result.output.trim().split('\n');
  const last = lines[lines.length - 1]?.trim().slice(0, 300);
  // What git says for a repository that does not exist: GitHub asks for a
  // password (and prompts are off) rather than admit it, as it does for a
  // private one.
  if (
    /could not read Username|terminal prompts disabled|repository not found|does not appear to be a git repository/i.test(
      result.output,
    )
  ) {
    return new BadGatewayException(
      `${repo} was not found, or it is private. Only public repositories can be installed.`,
    );
  }
  return new BadGatewayException(
    `${label} from ${repo} failed: ${last || result.reason || 'git failed'}`,
  );
}
