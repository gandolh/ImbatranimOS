import { readdirSync, readFileSync } from 'fs';
import { isAbsolute, join, normalize } from 'path';
import { z } from 'zod';

/**
 * The marketplace catalog (brief 120): `marketplace/<id>.json` in THIS repo.
 *
 * A descriptor is the trust anchor. Only an app described here, at the commit
 * it pins, can be installed, and because the descriptor set is curated in the
 * OS repo, an installed app is first-party ("buggy, not malicious"), which is
 * what lets it run natively in the desktop's own realm. An app from an
 * arbitrary URL is another thing entirely (brief 158, `app-manifest.ts`): it
 * runs sandboxed, and its id starts with `x-`, which a catalog id may not.
 */

/** The `system` capabilities a descriptor may ask for. */
export const CAPABILITIES = [
  'fs',
  'http',
  'intents',
  'notify',
  'shortcuts',
  'schedule',
] as const;

/** An argv: no shell, so a descriptor cannot smuggle `;` or `$(…)` into a command. */
const argv = z.array(z.string().min(1).max(200)).min(1).max(32);

/** {@link innerPath}'s rule, without its length: relative, no `\` or NUL, never climbing out. */
export function isInnerPath(p: string): boolean {
  return (
    !isAbsolute(p) &&
    !p.includes('\\') &&
    !p.includes('\0') &&
    !normalize(p).split('/').includes('..')
  );
}

/** A path inside the clone: relative, normalised, never climbing out. */
export const innerPath = z
  .string()
  .min(1)
  .max(200)
  .refine(isInnerPath, 'must be a relative path inside the repository');

const size = z.object({
  w: z.number().int().min(200).max(4000),
  h: z.number().int().min(150).max(4000),
});

/** A window's sizes. A URL app's manifest uses the same shape. */
export const windowSchema = z
  .object({ defaultSize: size, minSize: size })
  .default({
    defaultSize: { w: 960, h: 640 },
    minSize: { w: 480, h: 320 },
  });

/** A Lucide icon name. */
export const iconSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/)
  .default('package');

/**
 * The module the desktop imports. Inside an output directory (`dist/app.mjs`):
 * that directory is what gets served, and the app's top level holds its source
 * and node_modules.
 */
export const entrySchema = innerPath
  .refine(
    (p) => p.endsWith('.mjs') || p.endsWith('.js'),
    'must be a .mjs or .js module',
  )
  .refine((p) => {
    const dir = normalize(p).split('/').slice(0, -1);
    return dir.length > 0 && !dir.includes('node_modules');
  }, 'must be inside the build output directory, like dist/app.mjs');

export function descriptorSchema(options: { allowLocalRepos: boolean }) {
  const repo = z
    .string()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return (
        protocol === 'https:' ||
        (options.allowLocalRepos && protocol === 'file:')
      );
    }, 'must be an https:// repository');

  return z
    .object({
      schemaVersion: z.literal(1),
      id: z
        .string()
        .regex(/^[a-z][a-z0-9-]{1,39}$/, 'lowercase letters, digits and -')
        // `x-…` is what an app installed from a URL is called (brief 158). A
        // catalog app taking one could be mistaken for, or replace, one.
        .refine((id) => !id.startsWith('x-'), 'must not start with x-'),
      name: z.string().min(1).max(60),
      description: z.string().max(300).default(''),
      meta: z.array(z.string().max(40)).max(20).default([]),
      source: z.object({
        repo,
        // A full commit id, not a tag or branch: a tag can be moved, and the
        // pin is what makes the curated descriptor mean the code it reviewed.
        ref: z
          .string()
          .regex(/^[0-9a-f]{40}$/, 'must be a full 40-character commit id'),
        subdir: innerPath.optional(),
      }),
      type: z.enum(['static', 'service']),
      runtime: z.literal('native'),
      build: z.object({
        install: argv.optional(),
        command: argv,
        entry: entrySchema,
      }),
      server: z
        .object({
          command: argv,
          portEnv: z.string().regex(/^[A-Z][A-Z0-9_]{0,40}$/),
          health: z
            .string()
            .regex(/^\/[^\s]*$/)
            .default('/'),
        })
        .optional(),
      window: windowSchema,
      capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
      icon: iconSchema,
      minSystemVersion: z.number().int().min(1),
    })
    .superRefine((d, ctx) => {
      if (d.type === 'service' && !d.server) {
        ctx.addIssue({
          code: 'custom',
          path: ['server'],
          message: 'a service app needs a server',
        });
      }
      if (d.type === 'static' && d.server) {
        ctx.addIssue({
          code: 'custom',
          path: ['server'],
          message: 'a static app has no server',
        });
      }
    });
}

export type Descriptor = z.infer<ReturnType<typeof descriptorSchema>>;

export interface Catalog {
  apps: ReadonlyMap<string, Descriptor>;
  /** Files that were refused, and why. Shown in the Marketplace pane. */
  problems: { file: string; problem: string }[];
}

/**
 * Read every `*.json` in the catalog directory. A broken descriptor is
 * skipped and reported, never half-loaded; so is one whose file name is not
 * its id, or a second one with the same id.
 */
export function loadCatalog(
  dir: string,
  options: { allowLocalRepos: boolean },
): Catalog {
  const schema = descriptorSchema(options);
  const apps = new Map<string, Descriptor>();
  const problems: Catalog['problems'] = [];
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return { apps, problems };
  }
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      problems.push({ file, problem: `not JSON: ${(err as Error).message}` });
      continue;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problems.push({
        file,
        problem: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      });
      continue;
    }
    const descriptor = parsed.data;
    if (`${descriptor.id}.json` !== file) {
      problems.push({
        file,
        problem: `the file must be named ${descriptor.id}.json`,
      });
      continue;
    }
    apps.set(descriptor.id, descriptor);
  }
  return { apps, problems };
}
