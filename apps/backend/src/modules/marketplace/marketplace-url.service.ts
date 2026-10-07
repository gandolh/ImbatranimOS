import {
  BadGatewayException,
  BadRequestException,
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
import {
  MANIFEST_FILE,
  MAX_MANIFEST_BYTES,
  parseManifest,
  type AppManifest,
} from './app-manifest';
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

/** Contract B's `Inspection`: what the pane's consent card shows. */
export interface Inspection {
  pending: string;
  id: string;
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
 * Apps installed from a URL (brief 158).
 *
 * The threat model is the reverse of the catalog's: nobody reviewed the
 * repository, so the app is treated as potentially malicious. Nothing from it
 * runs on the machine. The repository carries the built module, and the OS
 * clones it (with the catalog's fetch steps) and runs no install, build or
 * server. Its code runs only in the browser, in an opaque-origin frame, and
 * its files are served only under a per-window token with the sandbox's
 * headers (`sandbox-headers.ts`).
 *
 * A check (`inspect`) resolves the URL to a commit, clones it, reads and
 * validates `imbatranim.json`, and holds the clone for the owner's consent;
 * `install` keeps it. The check takes its turn on the builds' queue.
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
      const { root, entry, manifest } = await this.cloneAndValidate(
        dir,
        source,
      );
      // A damaged row is no installed commit to compare with; installing
      // over it writes a whole new row.
      const row = this.marketplace.sandboxedRow(id);
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
        current: row ? { commit: row.ref } : null,
      };
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true });
      throw err;
    } finally {
      this.pendings.stopCloning(dir);
    }
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
   * Fetch the commit into `dir` (no install or build step: a URL app is
   * prebuilt) and check what came: the clone's size, the subdirectory, the
   * manifest, the entry and the size of the directory that would be served.
   */
  private async cloneAndValidate(
    dir: string,
    source: AppSource,
  ): Promise<{ root: string; entry: string; manifest: AppManifest }> {
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
    const realRoot = await fs.realpath(root);

    // ── the manifest: a real file inside the app's directory ──
    let text: string;
    try {
      const real = await fs.realpath(join(root, MANIFEST_FILE));
      if (!isInside(realRoot, real)) throw new Error('outside');
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) {
        throw new Error('not a small file');
      }
      text = await fs.readFile(real, 'utf8');
    } catch {
      throw new BadRequestException(
        `There is no ${MANIFEST_FILE} in ${where}. An app installed from a URL needs one beside its built module.`,
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new BadRequestException(
        `${MANIFEST_FILE} is not JSON: ${(err as Error).message}`,
      );
    }
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
    return { root: rootRel === '.' ? '' : rootRel, entry, manifest };
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
   * Keep a checked app: point its row at the clone, delete its other builds
   * and revoke its tokens, so a window still open on the old build stops
   * being served and reloads onto the new one. 404 when the check is unknown
   * or expired.
   */
  async install(pending: string): Promise<MarketplaceApp> {
    const gone = () =>
      new NotFoundException('That check has expired. Check the URL again.');
    const checked = this.pendings.get(pending);
    if (!checked) throw gone();
    if (!(await exists(join(checked.dir, checked.root, checked.entry)))) {
      await this.pendings.cancel(pending);
      throw gone();
    }
    // Cancelled or expired while the file was looked at.
    if (this.pendings.get(pending) !== checked) throw gone();

    // From here to the row, nothing awaits: no clean-up can run in between
    // and take the clone, which stops being held by the check now.
    this.pendings.take(pending);
    this.dbs.db
      .prepare(
        `INSERT INTO marketplace_apps (id, ref, build_id, root, entry, installed_at, runtime, source, manifest)
         VALUES (@id, @ref, @build_id, @root, @entry, @installed_at, 'sandboxed', @source, @manifest)
         ON CONFLICT (id) DO UPDATE SET ref = excluded.ref, build_id = excluded.build_id,
           root = excluded.root, entry = excluded.entry, installed_at = excluded.installed_at,
           runtime = excluded.runtime, source = excluded.source, manifest = excluded.manifest`,
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
