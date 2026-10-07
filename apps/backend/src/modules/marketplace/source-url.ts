import { createHash } from 'crypto';

/**
 * Where an app installed from a URL comes from (brief 158): the URL the owner
 * pasted, what it resolves to, and the id that follows from it.
 *
 * GitHub only, plus `file:` behind `MARKETPLACE_ALLOW_LOCAL_REPOS` for tests.
 * Everything here is pure; `git ls-remote` is run by the caller and its output
 * handed to {@link resolveRef}.
 */

/** `Inspection['source']` in contract B, as stored with the installed app. */
export interface AppSource {
  /** Normalized, e.g. `https://github.com/o/r/tree/main/sub`. */
  url: string;
  /** `https://github.com/o/r`, or the `file:` URL without its fragment. */
  repo: string;
  /** The branch or tag asked for (or the default branch's name); null when unknown. */
  ref: string | null;
  /** 40 hex. */
  commit: string;
  subdir: string | null;
}

/** A pasted URL, taken apart but not yet resolved. */
export interface ParsedSourceUrl {
  /** `https://github.com/o/r` (lowercased, no `.git`), or `file:///abs/path`. */
  repo: string;
  /**
   * What followed `/tree/` (or the `file:` URL's fragment), decoded, one path
   * segment each. Empty for the default branch. Which leading segments are the
   * ref and which the subdirectory is only known once the refs are listed.
   */
  refPath: string[];
}

/** A URL or a ref that cannot be installed. The message is shown to the owner. */
export class SourceUrlError extends Error {}

export const ONLY_GITHUB = 'Only github.com URLs can be installed for now.';
const NOT_A_REPO =
  'That is not a repository URL. Paste https://github.com/<owner>/<repo>, or …/tree/<branch>/<folder> for an app in a folder.';

/** GitHub's own rule for owner and repository names, near enough. */
const NAME = /^[A-Za-z0-9_.-]+$/;
const FULL_SHA = /^[0-9a-fA-F]{40}$/;
/** One line of `git ls-remote`: `<sha>\t<ref>`. */
const REF_LINE = /^([0-9a-f]{40})\t(\S+)$/;
/** What ls-remote appends to an annotated tag's name for the commit it points at. */
const PEELED = '^{}';
/** Deeper than any real app's folder. Keeps the ls-remote argv bounded. */
const MAX_SEGMENTS = 32;
const MAX_URL_LENGTH = 2000;

/**
 * Take a pasted URL apart. Accepted:
 *
 * - `https://github.com/<owner>/<repo>[.git][/]`, with or without the scheme;
 * - `https://github.com/<owner>/<repo>/tree/<ref>[/<subdir…>]`;
 * - with `allowLocalRepos`, `file:///abs/path[#<ref>[/<subdir>]]`.
 *
 * A query string or fragment on a GitHub URL is dropped (a URL copied from the
 * browser often has `?tab=readme-ov-file`). The path is read as typed, before
 * the URL parser would fold `..` away, so a URL that climbs is refused rather
 * than quietly meaning something else.
 */
export function parseSourceUrl(
  input: string,
  options: { allowLocalRepos: boolean },
): ParsedSourceUrl {
  const text = input.trim();
  // The URL parser drops tabs and newlines and reads `\` as `/`, so a URL
  // holding them would mean one thing to it and another to the raw-path read
  // below. No real repository URL has them.
  if (
    text === '' ||
    text.length > MAX_URL_LENGTH ||
    /[\s\\]/.test(text) ||
    hasControl(text)
  ) {
    throw new SourceUrlError(NOT_A_REPO);
  }
  if (/^file:/i.test(text)) {
    if (!options.allowLocalRepos) throw new SourceUrlError(ONLY_GITHUB);
    return parseFileUrl(text);
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SourceUrlError(NOT_A_REPO);
  }
  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new SourceUrlError(ONLY_GITHUB);
  }
  if (url.protocol !== 'https:') {
    throw new SourceUrlError(
      'Use the https:// address of the repository on github.com.',
    );
  }
  if (url.username || url.password || url.port) {
    throw new SourceUrlError(
      'That URL carries a user name, a password or a port. Paste the plain https://github.com/<owner>/<repo> address.',
    );
  }

  // The path as typed: everything after the authority, up to `?` or `#`.
  const rawPath = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(
    withScheme,
  )![1];
  const segments = rawPath.split('/').slice(1);
  if (segments.length > 0 && segments[segments.length - 1] === '') {
    segments.pop();
  }
  const [owner, repoName, tree, ...rest] = segments;
  if (owner === undefined || repoName === undefined) {
    throw new SourceUrlError(NOT_A_REPO);
  }
  const repo = repoName.replace(/\.git$/i, '');
  for (const name of [owner, repo]) {
    if (!NAME.test(name) || name === '.' || name === '..') {
      throw new SourceUrlError(NOT_A_REPO);
    }
  }
  if (tree !== undefined && (tree !== 'tree' || rest.length === 0)) {
    throw new SourceUrlError(NOT_A_REPO);
  }
  return {
    // GitHub's owner and repository names are case-insensitive. Lowercased,
    // `github.com/Owner/Repo` and `github.com/owner/repo` are one app, not two.
    repo: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    refPath: decodeSegments(rest),
  };
}

function parseFileUrl(text: string): ParsedSourceUrl {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SourceUrlError(NOT_A_REPO);
  }
  const hashAt = text.indexOf('#');
  const rawPath = (hashAt === -1 ? text : text.slice(0, hashAt)).replace(
    /^file:\/\/[^/]*/i,
    '',
  );
  if (
    url.host !== '' ||
    url.search !== '' ||
    !rawPath.startsWith('/') ||
    rawPath.split('/').some((s) => s === '.' || s === '..')
  ) {
    throw new SourceUrlError(
      'A local repository is file:///absolute/path[#<ref>[/<folder>]].',
    );
  }
  const path = rawPath.replace(/\/+$/, '') || '/';
  const fragment = hashAt === -1 ? '' : text.slice(hashAt + 1);
  const refPath = fragment === '' ? [] : fragment.split('/');
  if (refPath.length > 0 && refPath[refPath.length - 1] === '') refPath.pop();
  return { repo: `file://${path}`, refPath: decodeSegments(refPath) };
}

/** Percent-decode each segment, refusing what could not be a ref or a folder name. */
function decodeSegments(raw: string[]): string[] {
  if (raw.length > MAX_SEGMENTS) throw new SourceUrlError(NOT_A_REPO);
  return raw.map((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new SourceUrlError(NOT_A_REPO);
    }
    if (
      decoded === '' ||
      decoded === '.' ||
      decoded === '..' ||
      /[/\\]/.test(decoded) ||
      hasControl(decoded)
    ) {
      throw new SourceUrlError(NOT_A_REPO);
    }
    return decoded;
  });
}

/** NUL, the other C0 controls and DEL. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

// ── resolving ────────────────────────────────────────────────────────────────

/**
 * The patterns to hand `git ls-remote` for a ref path: every leading prefix as
 * a branch, a tag and a peeled tag. Listing only these keeps the output small
 * however many refs the repository has. Empty for the default branch (ask for
 * `HEAD` with `--symref`) and for a full commit id (list every branch and tag
 * with `--heads --tags`, filtered by {@link commitTipLines}).
 */
export function lsRemotePatterns(refPath: string[]): string[] {
  if (refPath.length === 0 || FULL_SHA.test(refPath[0])) return [];
  const patterns: string[] = [];
  for (let k = 1; k <= refPath.length; k++) {
    const name = refPath.slice(0, k).join('/');
    patterns.push(
      `refs/heads/${name}`,
      `refs/tags/${name}`,
      `refs/tags/${name}^{}`,
    );
  }
  return patterns;
}

/**
 * True when the ref path starts with a full commit id. That commit is checked
 * against every branch and tag of the repository (see {@link resolveRef}), so
 * its `ls-remote` lists them all, through {@link commitTipLines}.
 */
export function isCommitRefPath(refPath: string[]): boolean {
  return refPath.length > 0 && FULL_SHA.test(refPath[0]);
}

/**
 * A filter for `git ls-remote --heads --tags` output when the URL names a
 * commit: the lines {@link resolveRef} needs to tell whether that commit is a
 * branch's or a tag's tip, and no others, so the output of a repository with
 * thousands of refs is never held. That is every line naming the commit, and
 * the peeled line (`refs/tags/<t>^{}`) of a tag whose own line was kept, which
 * ls-remote prints right after it: with it, an annotated tag's object id is
 * told apart from the commit it points at.
 */
export function commitTipLines(commit: string): (line: string) => boolean {
  const sha = commit.toLowerCase();
  const kept = new Set<string>();
  return (line) => {
    const m = REF_LINE.exec(line);
    if (!m) return false;
    if (m[1] === sha) {
      kept.add(m[2]);
      return true;
    }
    return m[2].endsWith(PEELED) && kept.has(m[2].slice(0, -PEELED.length));
  };
}

/**
 * The commits a branch or a tag of the listing points at. An annotated tag
 * counts by the commit it peels to, not by its own object id; a lightweight
 * tag is its commit already. Nothing else counts: not `HEAD` alone, not
 * `refs/pull/*` (on GitHub those carry commits from forks), not any other
 * namespace.
 */
function tipCommits(refs: ReadonlyMap<string, string>): Set<string> {
  const tips = new Set<string>();
  for (const [ref, sha] of refs) {
    if (ref.startsWith('refs/heads/') && !ref.endsWith(PEELED)) {
      tips.add(sha);
    } else if (ref.startsWith('refs/tags/')) {
      if (ref.endsWith(PEELED) || !refs.has(`${ref}${PEELED}`)) tips.add(sha);
    }
  }
  return tips;
}

export interface ResolvedRef {
  /** The branch or tag; for the default branch, its name when the remote says it; for a commit, the commit. */
  ref: string | null;
  commit: string;
  subdir: string | null;
}

/**
 * Resolve a ref path against `git ls-remote` output (`<sha>\t<ref>` lines,
 * plus `ref: <target>\tHEAD` with `--symref`):
 *
 * - no ref → `HEAD`, the default branch;
 * - a 40-hex first segment → that commit, the rest the subdirectory, but only
 *   when it is the tip of one of the repository's branches or tags (the
 *   output is then `ls-remote --heads --tags`). GitHub serves any commit of a
 *   fork network through every repository in it, so a commit pushed to an
 *   attacker's fork can be fetched from `github.com/<good>/<app>` and would
 *   be shown, and installed under the id, of the genuine repository. A
 *   branch or tag tip is the repository's own;
 * - otherwise the longest leading run of segments that names a branch or a
 *   tag (a branch wins over a tag of the same name), the rest the
 *   subdirectory. An annotated tag is peeled to its commit.
 *
 * Throws a {@link SourceUrlError} naming the ref when nothing matches.
 */
export function resolveRef(
  lsRemoteOutput: string,
  refPath: string[],
  repo: string,
): ResolvedRef {
  const refs = new Map<string, string>();
  let headTarget: string | null = null;
  for (const line of lsRemoteOutput.split('\n')) {
    const symref = /^ref: (\S+)\tHEAD$/.exec(line);
    if (symref) {
      headTarget = symref[1];
      continue;
    }
    const m = REF_LINE.exec(line);
    if (m) refs.set(m[2], m[1]);
  }
  const subdirOf = (rest: string[]) => (rest.length ? rest.join('/') : null);

  if (refPath.length === 0) {
    const commit = refs.get('HEAD');
    if (!commit) {
      throw new SourceUrlError(`${repo} has no default branch to install.`);
    }
    const branch = headTarget?.startsWith('refs/heads/')
      ? headTarget.slice('refs/heads/'.length)
      : null;
    return { ref: branch, commit, subdir: null };
  }

  if (FULL_SHA.test(refPath[0])) {
    const commit = refPath[0].toLowerCase();
    if (!tipCommits(refs).has(commit)) {
      throw new SourceUrlError(
        `That commit is not the tip of any branch or tag of ${repo}. Install from a branch or tag URL instead.`,
      );
    }
    return { ref: commit, commit, subdir: subdirOf(refPath.slice(1)) };
  }

  for (let k = refPath.length; k >= 1; k--) {
    const name = refPath.slice(0, k).join('/');
    const commit =
      refs.get(`refs/heads/${name}`) ??
      refs.get(`refs/tags/${name}^{}`) ??
      refs.get(`refs/tags/${name}`);
    if (commit) {
      return { ref: name, commit, subdir: subdirOf(refPath.slice(k)) };
    }
  }

  const asked = refPath.join('/');
  if (/^[0-9a-f]{4,39}$/i.test(refPath[0])) {
    throw new SourceUrlError(
      `There is no branch or tag "${refPath[0]}" in ${repo}. A commit needs its full 40-character id.`,
    );
  }
  throw new SourceUrlError(
    refPath.length === 1
      ? `There is no branch or tag "${asked}" in ${repo}.`
      : `No branch or tag in ${repo} matches the start of "${asked}".`,
  );
}

// ── naming ───────────────────────────────────────────────────────────────────

/**
 * The URL to show and to resolve again on an update: the repository, plus
 * `/tree/<ref>[/<subdir>]` (or `#<ref>[/<subdir>]` for `file:`) when a ref was
 * asked for. The default branch stays implicit, so an update follows it.
 */
export function sourceUrl(
  repo: string,
  askedRef: string | null,
  subdir: string | null,
): string {
  if (askedRef === null) return repo;
  const path = [...askedRef.split('/'), ...(subdir ? subdir.split('/') : [])]
    .map(encodeURIComponent)
    .join('/');
  return repo.startsWith('file:') ? `${repo}#${path}` : `${repo}/tree/${path}`;
}

/**
 * The installed id: `x-` and the first 12 hex characters of the SHA-256 of
 * `<repo>#<subdir>`. Derived, never chosen, so a repository cannot claim
 * another app's id, and the same app pasted twice is the same app.
 */
export function deriveAppId(repo: string, subdir: string | null): string {
  const hash = createHash('sha256')
    .update(`${repo}#${subdir ?? ''}`)
    .digest('hex');
  return `x-${hash.slice(0, 12)}`;
}

/** An id only an app installed from a URL has. The catalog refuses ids like it. */
export function isUrlAppId(id: string): boolean {
  return id.startsWith('x-');
}
