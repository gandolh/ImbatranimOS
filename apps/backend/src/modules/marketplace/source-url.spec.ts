import { createHash } from 'crypto';

import {
  commitTipLines,
  deriveAppId,
  isCommitRefPath,
  lsRemotePatterns,
  ONLY_GITHUB,
  parseSourceUrl,
  resolveRef,
  sourceUrl,
  SourceUrlError,
} from './source-url';

const github = { allowLocalRepos: false };
const local = { allowLocalRepos: true };
const REPO = 'https://github.com/o/r';
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const D = 'd'.repeat(40);

/** What `git ls-remote` prints, tab-separated. */
const lsRemote = (...lines: [string, string][]) =>
  lines.map(([a, b]) => `${a}\t${b}`).join('\n') + '\n';

function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SourceUrlError);
    return (err as Error).message;
  }
  throw new Error('expected a refusal');
}

describe('parseSourceUrl (brief 158)', () => {
  it.each([
    ['https://github.com/o/r', REPO, []],
    ['https://github.com/o/r/', REPO, []],
    ['https://github.com/o/r.git', REPO, []],
    ['https://github.com/o/r.git/', REPO, []],
    ['github.com/o/r', REPO, []],
    ['  github.com/o/r  ', REPO, []],
    [
      'https://github.com/O-wn.er_/Re.po',
      'https://github.com/o-wn.er_/re.po',
      [],
    ],
    ['https://GitHub.com/o/r', REPO, []],
    ['https://github.com/o/r?tab=readme-ov-file', REPO, []],
    ['https://github.com/o/r#readme', REPO, []],
    ['https://github.com/o/r/tree/main', REPO, ['main']],
    ['https://github.com/o/r/tree/main/', REPO, ['main']],
    [
      'https://github.com/o/r/tree/feature/x/games/hollow',
      REPO,
      ['feature', 'x', 'games', 'hollow'],
    ],
    ['github.com/o/r/tree/v1.0.0/app', REPO, ['v1.0.0', 'app']],
    ['https://github.com/o/r/tree/f%C3%BCr', REPO, ['für']],
  ])('accepts %s', (input, repo, refPath) => {
    expect(parseSourceUrl(input, github)).toEqual({ repo, refPath });
  });

  it.each([
    'https://gitlab.com/o/r',
    'https://github.com.evil.example/o/r',
    'https://evil.example/github.com/o/r',
    'https://github.com@evil.example/o/r',
    'https://raw.githubusercontent.com/o/r/main/x',
    'https://www.github.com/o/r',
    'ftp://github.example/o/r',
  ])('refuses another host: %s', (input) => {
    expect(refusal(() => parseSourceUrl(input, github))).toBe(ONLY_GITHUB);
  });

  it.each([
    ['http, not https', 'http://github.com/o/r'],
    ['a user name', 'https://me@github.com/o/r'],
    ['a password', 'https://me:secret@github.com/o/r'],
    ['a port', 'https://github.com:444/o/r'],
    ['no repository', 'https://github.com/o'],
    ['the bare host', 'https://github.com'],
    ['a .. owner', 'https://github.com/../r'],
    ['a . repo', 'https://github.com/o/.'],
    ['a .. repo', 'github.com/o/..'],
    ['an encoded owner', 'https://github.com/%2e%2e/r'],
    ['a climb after the repo', 'https://github.com/o/r/tree/main/../../x'],
    ['an encoded climb', 'https://github.com/o/r/tree/main/%2e%2e'],
    ['an encoded slash', 'https://github.com/o/r/tree/main/a%2Fb'],
    ['an empty segment', 'https://github.com/o/r/tree/main//x'],
    ['tree with no ref', 'https://github.com/o/r/tree'],
    ['a file view', 'https://github.com/o/r/blob/main/README.md'],
    ['an issues page', 'https://github.com/o/r/issues'],
    ['a backslash', 'https://github.com/o\\r'],
    ['a newline', 'https://github.com/o/r\n/tree/x'],
    ['nothing', ''],
    ['an ssh remote', 'git@github.com:o/r.git'],
  ])('refuses %s', (_label, input) => {
    expect(() => parseSourceUrl(input, github)).toThrow(SourceUrlError);
  });

  it('accepts file: only with local repositories allowed', () => {
    expect(refusal(() => parseSourceUrl('file:///srv/repo', github))).toBe(
      ONLY_GITHUB,
    );
    expect(parseSourceUrl('file:///srv/repo', local)).toEqual({
      repo: 'file:///srv/repo',
      refPath: [],
    });
    expect(parseSourceUrl('file:///srv/repo/', local).repo).toBe(
      'file:///srv/repo',
    );
    expect(parseSourceUrl('file:///srv/repo#feature/x/app', local)).toEqual({
      repo: 'file:///srv/repo',
      refPath: ['feature', 'x', 'app'],
    });
  });

  it.each([
    'file://host/srv/repo',
    'file:///srv/../etc',
    'file:///srv/repo?x=1',
    'file:///srv/repo#main/../x',
    'file:relative',
  ])('refuses the local form %s', (input) => {
    expect(() => parseSourceUrl(input, local)).toThrow(SourceUrlError);
  });
});

describe('resolveRef (brief 158)', () => {
  it('resolves no ref to the default branch, named by --symref', () => {
    const out = `ref: refs/heads/trunk\tHEAD\n${A}\tHEAD\n`;
    expect(resolveRef(out, [], REPO)).toEqual({
      ref: 'trunk',
      commit: A,
      subdir: null,
    });
  });

  it('reports no branch name when the remote does not give one', () => {
    expect(resolveRef(lsRemote([A, 'HEAD']), [], REPO)).toEqual({
      ref: null,
      commit: A,
      subdir: null,
    });
  });

  it('refuses a repository with no default branch', () => {
    expect(() => resolveRef('', [], REPO)).toThrow(/no default branch/);
  });

  it('takes the longest prefix naming a branch, a slash in its name, the rest as the subdirectory', () => {
    const out = lsRemote(
      [A, 'refs/heads/feature'],
      [B, 'refs/heads/feature/x'],
      [C, 'refs/remotes/origin/feature/x/games'],
    );
    expect(resolveRef(out, ['feature', 'x', 'games', 'hollow'], REPO)).toEqual({
      ref: 'feature/x',
      commit: B,
      subdir: 'games/hollow',
    });
    expect(resolveRef(out, ['feature', 'y'], REPO)).toEqual({
      ref: 'feature',
      commit: A,
      subdir: 'y',
    });
  });

  it('peels an annotated tag to its commit', () => {
    const out = lsRemote([C, 'refs/tags/v2'], [D, 'refs/tags/v2^{}']);
    expect(resolveRef(out, ['v2', 'app'], REPO)).toEqual({
      ref: 'v2',
      commit: D,
      subdir: 'app',
    });
    // A lightweight tag is its commit already.
    expect(resolveRef(lsRemote([A, 'refs/tags/v1']), ['v1'], REPO)).toEqual({
      ref: 'v1',
      commit: A,
      subdir: null,
    });
  });

  it('prefers a branch over a tag of the same name', () => {
    const out = lsRemote(
      [C, 'refs/tags/main'],
      [D, 'refs/tags/main^{}'],
      [A, 'refs/heads/main'],
    );
    expect(resolveRef(out, ['main'], REPO).commit).toBe(A);
  });

  describe('a full commit id', () => {
    const NOT_A_TIP = `That commit is not the tip of any branch or tag of ${REPO}. Install from a branch or tag URL instead.`;

    it('is taken, lowercased, when it is the tip of a branch', () => {
      const sha = 'ABCDEF0123456789abcdef0123456789ABCDEF01';
      const tip = sha.toLowerCase();
      expect(isCommitRefPath([sha, 'app'])).toBe(true);
      // Every branch and tag is listed instead (ls-remote --heads --tags).
      expect(lsRemotePatterns([sha, 'app'])).toEqual([]);
      const out = lsRemote([A, 'refs/heads/main'], [tip, 'refs/heads/next']);
      expect(resolveRef(out, [sha, 'app'], REPO)).toEqual({
        ref: tip,
        commit: tip,
        subdir: 'app',
      });
    });

    it("is taken when it is a lightweight tag's commit, or an annotated tag's peeled one", () => {
      expect(resolveRef(lsRemote([B, 'refs/tags/v1']), [B], REPO).commit).toBe(
        B,
      );
      const annotated = lsRemote([C, 'refs/tags/v2'], [D, 'refs/tags/v2^{}']);
      expect(resolveRef(annotated, [D, 'app'], REPO)).toEqual({
        ref: D,
        commit: D,
        subdir: 'app',
      });
    });

    it('is refused when no branch or tag ends at it: a fork can be fetched through the parent', () => {
      // An older commit of main, or one pushed to a fork: GitHub serves both
      // under the parent's URL, but neither is a tip of the parent's refs.
      const out = lsRemote([A, 'refs/heads/main'], [B, 'refs/tags/v1']);
      expect(refusal(() => resolveRef(out, [C], REPO))).toBe(NOT_A_TIP);
      expect(refusal(() => resolveRef('', [C, 'app'], REPO))).toBe(NOT_A_TIP);
    });

    it('is refused when only a pull request, HEAD or another namespace names it', () => {
      for (const ref of [
        'refs/pull/7/head',
        'refs/pull/7/merge',
        'refs/remotes/origin/main',
        'refs/notes/commits',
        'HEAD',
      ]) {
        expect([
          ref,
          refusal(() => resolveRef(lsRemote([C, ref]), [C], REPO)),
        ]).toEqual([ref, NOT_A_TIP]);
      }
    });

    it("is refused when it is an annotated tag's own object id, not its commit", () => {
      const out = lsRemote([C, 'refs/tags/v2'], [D, 'refs/tags/v2^{}']);
      expect(refusal(() => resolveRef(out, [C], REPO))).toBe(NOT_A_TIP);
    });

    it("keeps only the ls-remote lines about the commit, and a kept tag's peeled line", () => {
      const lines = [
        `${A}\trefs/heads/main`,
        `${C}\trefs/heads/next`,
        `${C}\trefs/tags/v2`,
        `${D}\trefs/tags/v2^{}`,
        `${A}\trefs/tags/v3`,
        `${C}\trefs/tags/v3^{}`,
        `${B}\trefs/tags/v4`,
        `${A}\trefs/tags/v4^{}`,
        'garbage',
        '',
      ];
      const keep = commitTipLines(C.toUpperCase());
      expect(lines.filter(keep)).toEqual([
        `${C}\trefs/heads/next`,
        `${C}\trefs/tags/v2`,
        `${D}\trefs/tags/v2^{}`,
        `${C}\trefs/tags/v3^{}`,
      ]);
      // What is kept still says the right thing.
      const kept = lines.filter(commitTipLines(C)).join('\n');
      expect(resolveRef(kept, [C], REPO).commit).toBe(C);
      const tagOnly = lines.filter((l) => !l.includes('refs/heads/'));
      expect(
        resolveRef(tagOnly.filter(commitTipLines(C)).join('\n'), [C], REPO)
          .commit,
      ).toBe(C);
      // A peeled line naming the commit is kept on its own.
      expect(
        resolveRef(lines.filter(commitTipLines(D)).join('\n'), [D], REPO)
          .commit,
      ).toBe(D);
    });
  });

  it('refuses a ref nothing matches, naming it', () => {
    const out = lsRemote([A, 'refs/heads/main']);
    expect(refusal(() => resolveRef(out, ['nope'], REPO))).toBe(
      `There is no branch or tag "nope" in ${REPO}.`,
    );
    expect(refusal(() => resolveRef(out, ['nope', 'sub'], REPO))).toMatch(
      /"nope\/sub"/,
    );
    // A short commit id is not looked up; the message says what to do.
    expect(refusal(() => resolveRef(out, ['abc1234'], REPO))).toMatch(
      /full 40-character id/,
    );
  });

  it('asks ls-remote for every prefix as a branch, a tag and a peeled tag', () => {
    expect(lsRemotePatterns([])).toEqual([]);
    expect(lsRemotePatterns(['feature', 'x'])).toEqual([
      'refs/heads/feature',
      'refs/tags/feature',
      'refs/tags/feature^{}',
      'refs/heads/feature/x',
      'refs/tags/feature/x',
      'refs/tags/feature/x^{}',
    ]);
  });
});

describe('naming a URL app (brief 158)', () => {
  it('derives the id from the repository and subdirectory', () => {
    const expected = `x-${createHash('sha256')
      .update(`${REPO}#games/hollow`)
      .digest('hex')
      .slice(0, 12)}`;
    expect(deriveAppId(REPO, 'games/hollow')).toBe(expected);
    expect(deriveAppId(REPO, 'games/hollow')).toMatch(/^x-[0-9a-f]{12}$/);
    expect(deriveAppId(REPO, null)).toBe(
      `x-${createHash('sha256').update(`${REPO}#`).digest('hex').slice(0, 12)}`,
    );
    expect(deriveAppId(REPO, null)).not.toBe(deriveAppId(REPO, 'games'));
  });

  it('gives the same id however the URL was typed', () => {
    const ids = [
      'https://github.com/O/R.git',
      'github.com/o/r/',
      'https://github.com/o/r?tab=readme',
    ].map((u) => deriveAppId(parseSourceUrl(u, github).repo, null));
    expect(new Set(ids).size).toBe(1);
  });

  it('normalizes the source URL', () => {
    expect(sourceUrl(REPO, null, null)).toBe(REPO);
    expect(sourceUrl(REPO, 'main', 'sub')).toBe(`${REPO}/tree/main/sub`);
    expect(sourceUrl(REPO, 'feature/x', 'a b')).toBe(
      `${REPO}/tree/feature/x/a%20b`,
    );
    expect(sourceUrl('file:///srv/repo', 'main', 'app')).toBe(
      'file:///srv/repo#main/app',
    );
  });

  it('round-trips a normalized URL through the parser', () => {
    const url = sourceUrl(REPO, 'feature/x', 'games/für');
    expect(parseSourceUrl(url, github)).toEqual({
      repo: REPO,
      refPath: ['feature', 'x', 'games', 'für'],
    });
  });
});
