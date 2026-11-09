import { descriptorSchema, type Descriptor } from './catalog';
import { MANIFEST_FILE } from './manifest-file';
import { deriveAppId } from './source-url';

/**
 * `imbatranim.json` version 2: an app from a URL that builds from source
 * and runs natively, like a catalog app, once it is verified or the owner
 * trusts its commit.
 *
 * It is the catalog's descriptor without the fields the OS settles itself:
 * `id` (derived from the source, see `deriveAppId`), `source` (the URL the
 * owner pasted, resolved to a commit) and `runtime` (always native). The rest
 * is validated by the catalog's own schema, so a URL app asks for the same
 * capabilities, builds with the same argv rules and declares the same windows,
 * file types, server and hooks a catalog app does.
 *
 * Its shape follows its `build`, as the catalog's two versions do: `build.entry`
 * is one app (the catalog's version 1 fields); `build.output` with `apps` is
 * several apps from one build (version 2). Version 1 was a prebuilt app run
 * in a sandboxed frame; that path is gone, and a version 1 file is refused at
 * the check.
 */

export const NATIVE_MANIFEST_VERSION = 2;

/** What the OS sets for a URL app, so its manifest may not. */
const DERIVED_KEYS = ['id', 'source', 'runtime'] as const;

/**
 * The id the catalog's schema checks while the manifest is validated. It is
 * replaced by the derived one before anything else sees the descriptor.
 */
const PLACEHOLDER_ID = 'url-app';

/** The longest an app id may be (`isAppId`). */
const MAX_APP_ID = 40;

/** The source a manifest is read for: the repository, the commit and the app's folder. */
export interface NativeSource {
  repo: string;
  commit: string;
  subdir: string | null;
}

export type NativeManifestResult =
  | { ok: true; descriptor: Descriptor }
  | { ok: false; problem: string };

/**
 * The ids of a URL app's apps. One app (`build.entry`) takes the derived id.
 * Each app of several takes the derived id, a dash and its own id from the
 * manifest, so it can't clash with a catalog app (whose ids never start with
 * `x-`) or with another URL app's.
 */
export function urlAppIds(derived: string, local: string[], suite: boolean) {
  return suite ? local.map((id) => `${derived}-${id}`) : [derived];
}

/**
 * Validate a version 2 manifest for `source`, and read it as the descriptor
 * the marketplace installs: its id derived, its source the resolved commit.
 * Fails with one sentence the Marketplace pane shows.
 */
export function parseNativeManifest(
  raw: unknown,
  source: NativeSource,
  options: { allowLocalRepos: boolean },
): NativeManifestResult {
  const fail = (where: string, message: string): NativeManifestResult => ({
    ok: false,
    problem: `${MANIFEST_FILE}: ${where ? `${where}: ` : ''}${message}`,
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('', 'must be a JSON object');
  }
  const { schemaVersion, ...fields } = raw as Record<string, unknown>;
  if (schemaVersion !== NATIVE_MANIFEST_VERSION) {
    return fail('schemaVersion', `must be ${NATIVE_MANIFEST_VERSION}`);
  }
  for (const key of DERIVED_KEYS) {
    if (key in fields) {
      return fail(
        key,
        `an app from a URL does not set its ${key}: the OS derives it`,
      );
    }
  }
  const build = fields.build as Record<string, unknown> | undefined;
  const suite =
    !!build && typeof build === 'object' && build.output !== undefined;
  const parsed = descriptorSchema(options).safeParse({
    ...fields,
    schemaVersion: suite ? 2 : 1,
    id: PLACEHOLDER_ID,
    // The folder is the URL's, already checked against the clone; the
    // catalog's shorter limit on it is not the manifest's business.
    source: { repo: source.repo, ref: source.commit },
    runtime: 'native',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.path.join('.'), issue.message);
  }
  const d = parsed.data;
  const derived = deriveAppId(source.repo, source.subdir);
  const ids = urlAppIds(
    derived,
    d.apps.map((a) => a.id),
    suite,
  );
  const tooLong = ids.findIndex((id) => id.length > MAX_APP_ID);
  if (tooLong >= 0) {
    return fail(
      `apps.${tooLong}.id`,
      `at most ${MAX_APP_ID - derived.length - 1} characters in an app from a URL`,
    );
  }
  return {
    ok: true,
    descriptor: {
      ...d,
      id: derived,
      source: {
        repo: source.repo,
        ref: source.commit,
        ...(source.subdir ? { subdir: source.subdir } : {}),
      },
      apps: d.apps.map((a, i) => ({ ...a, id: ids[i] })),
    },
  };
}
