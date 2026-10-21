import { readdirSync, readFileSync } from 'fs';
import { isAbsolute, join, normalize, posix } from 'path';
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
 *
 * Since brief 162 one descriptor may describe several apps built together
 * (`schemaVersion: 2`, an `apps` array): one clone, one build, one served
 * directory, one server, and every app in it shown on the desktop. A
 * version 1 descriptor is one app, and is read into the same shape.
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

const isModule = (p: string) => p.endsWith('.mjs') || p.endsWith('.js');

/**
 * The module the desktop imports. Inside an output directory (`dist/app.mjs`):
 * that directory is what gets served, and the app's top level holds its source
 * and node_modules.
 */
export const entrySchema = innerPath
  .refine(isModule, 'must be a .mjs or .js module')
  .refine((p) => {
    const dir = normalize(p).split('/').slice(0, -1);
    return dir.length > 0 && !dir.includes('node_modules');
  }, 'must be inside the build output directory, like dist/app.mjs');

/**
 * The rule for a descriptor's id and, since brief 162, for each of its apps'
 * ids: they share one namespace (see {@link loadCatalog}).
 */
const ID_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;
const idSchema = z
  .string()
  .regex(ID_PATTERN, 'lowercase letters, digits and -')
  // `x-…` is what an app installed from a URL is called (brief 158). A
  // catalog app taking one could be mistaken for, or replace, one.
  .refine((id) => !id.startsWith('x-'), 'must not start with x-');

/**
 * A version 2 build's `output`: the one directory of the clone that is
 * served, holding every app's entry and the chunks they share. Never the
 * clone's top (that holds the source) and never inside `node_modules`.
 */
export const outputSchema = innerPath.refine((p) => {
  const segments = posix.normalize(p).split('/').filter(Boolean);
  return (
    segments.length > 0 &&
    !segments.every((s) => s === '.') &&
    !segments.includes('node_modules')
  );
}, 'must be a build output directory inside the repository, like dist');

/** A version 2 app's `entry`: a module inside the build's `output`, like `docs/app.mjs`. */
export const appEntrySchema = innerPath
  .refine(isModule, 'must be a .mjs or .js module')
  .refine(
    (p) => !posix.normalize(p).split('/').includes('node_modules'),
    'must not be inside node_modules',
  );

/** File types an app opens (brief 162): extensions, or whole names for extensionless files. */
export const opensSchema = z
  .array(
    z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9._+-]{0,30}$/,
        'a lowercase extension, like docx',
      ),
  )
  .max(40)
  .default([]);

const capabilitiesSchema = z
  .array(z.enum(CAPABILITIES))
  .max(CAPABILITIES.length);

const serverSchema = z.object({
  command: argv,
  portEnv: z.string().regex(/^[A-Z][A-Z0-9_]{0,40}$/),
  health: z
    .string()
    .regex(/^\/[^\s]*$/)
    .default('/'),
});

function repoSchema(options: { allowLocalRepos: boolean }) {
  return z
    .string()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return (
        protocol === 'https:' ||
        (options.allowLocalRepos && protocol === 'file:')
      );
    }, 'must be an https:// repository');
}

function sourceSchema(options: { allowLocalRepos: boolean }) {
  return z.object({
    repo: repoSchema(options),
    // A full commit id, not a tag or branch: a tag can be moved, and the
    // pin is what makes the curated descriptor mean the code it reviewed.
    ref: z
      .string()
      .regex(/^[0-9a-f]{40}$/, 'must be a full 40-character commit id'),
    subdir: innerPath.optional(),
  });
}

/** Version 1 (brief 120): one descriptor, one app. */
function descriptorV1Schema(options: { allowLocalRepos: boolean }) {
  return z.object({
    schemaVersion: z.literal(1),
    id: idSchema,
    name: z.string().min(1).max(60),
    description: z.string().max(300).default(''),
    meta: z.array(z.string().max(40)).max(20).default([]),
    source: sourceSchema(options),
    type: z.enum(['static', 'service']),
    runtime: z.literal('native'),
    build: z.object({
      install: argv.optional(),
      command: argv,
      entry: entrySchema,
    }),
    server: serverSchema.optional(),
    window: windowSchema,
    capabilities: capabilitiesSchema,
    icon: iconSchema,
    minSystemVersion: z.number().int().min(1),
  });
}

/** One app of a version 2 descriptor: what the desktop shows and opens. */
export const suiteAppSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  description: z.string().max(300).default(''),
  meta: z.array(z.string().max(40)).max(20).default([]),
  entry: appEntrySchema,
  window: windowSchema,
  icon: iconSchema,
  opens: opensSchema,
  multiInstance: z.boolean().default(false),
  capabilities: capabilitiesSchema,
});

/**
 * Version 2 (brief 162): one build, several apps. The top level is what the
 * build shares; each item of `apps` is one app.
 */
function descriptorV2Schema(options: { allowLocalRepos: boolean }) {
  return z.object({
    schemaVersion: z.literal(2),
    id: idSchema,
    name: z.string().min(1).max(60),
    description: z.string().max(300).default(''),
    source: sourceSchema(options),
    type: z.enum(['static', 'service']),
    runtime: z.literal('native'),
    build: z.object({
      install: argv.optional(),
      command: argv,
      output: outputSchema,
    }),
    server: serverSchema.optional(),
    apps: z.array(suiteAppSchema).min(1).max(16),
    minSystemVersion: z.number().int().min(1),
  });
}

type DescriptorV1 = z.infer<ReturnType<typeof descriptorV1Schema>>;
type DescriptorV2 = z.infer<ReturnType<typeof descriptorV2Schema>>;

/** One app a descriptor puts on the desktop. Its `entry` is inside the build's `output`. */
export type CatalogApp = z.infer<typeof suiteAppSchema>;

/**
 * A descriptor as the rest of the backend reads it, whatever its version:
 * the build's shared fields at the top, the apps in `apps`. `schemaVersion`
 * is kept because the installed row differs by it (see `InstalledRow`).
 */
export interface Descriptor {
  schemaVersion: 1 | 2;
  id: string;
  name: string;
  description: string;
  source: DescriptorV2['source'];
  type: DescriptorV2['type'];
  runtime: 'native';
  build: {
    install?: string[];
    command: string[];
    /** The served directory, inside the app's directory, normalised, no trailing `/`. */
    output: string;
  };
  server?: DescriptorV2['server'];
  apps: CatalogApp[];
  minSystemVersion: number;
}

/** `dist/os/` and `./dist/os` → `dist/os`. */
function normalDir(p: string): string {
  return posix.normalize(p).replace(/\/+$/, '');
}

/**
 * A version 1 descriptor read as a version 2 one with a single app: the
 * entry's directory is the output, and the app's id is the descriptor's.
 */
function fromV1(d: DescriptorV1): Descriptor {
  const entry = posix.normalize(d.build.entry);
  return {
    schemaVersion: 1,
    id: d.id,
    name: d.name,
    description: d.description,
    source: d.source,
    type: d.type,
    runtime: d.runtime,
    build: {
      ...(d.build.install ? { install: d.build.install } : {}),
      command: d.build.command,
      output: posix.dirname(entry),
    },
    ...(d.server ? { server: d.server } : {}),
    apps: [
      {
        id: d.id,
        name: d.name,
        description: d.description,
        meta: d.meta,
        entry: posix.basename(entry),
        window: d.window,
        icon: d.icon,
        opens: [],
        multiInstance: false,
        capabilities: d.capabilities,
      },
    ],
    minSystemVersion: d.minSystemVersion,
  };
}

function fromV2(d: DescriptorV2): Descriptor {
  return {
    ...d,
    build: { ...d.build, output: normalDir(d.build.output) },
    apps: d.apps.map((a) => ({ ...a, entry: posix.normalize(a.entry) })),
  };
}

export function descriptorSchema(options: { allowLocalRepos: boolean }) {
  return z
    .discriminatedUnion('schemaVersion', [
      descriptorV1Schema(options),
      descriptorV2Schema(options),
    ])
    .transform(
      (d): Descriptor => (d.schemaVersion === 1 ? fromV1(d) : fromV2(d)),
    )
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
      const seen = new Set<string>();
      d.apps.forEach((a, i) => {
        if (seen.has(a.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['apps', i, 'id'],
            message: `${a.id} is listed twice`,
          });
        }
        seen.add(a.id);
      });
    });
}

export interface Catalog {
  /** By descriptor id. */
  descriptors: ReadonlyMap<string, Descriptor>;
  /** Files that were refused, and why. Shown in the Marketplace pane. */
  problems: { file: string; problem: string }[];
}

/**
 * Read every `*.json` in the catalog directory. A broken descriptor is
 * skipped and reported, never half-loaded; so is one whose file name is not
 * its id, or one that reuses an id an earlier file took.
 *
 * Descriptor ids and app ids are one namespace (brief 162): the desktop
 * knows apps by their ids and the routes know descriptors by theirs, so an
 * app id that is another descriptor's id, or another descriptor's app's,
 * would make one of them mean two things. An app may carry its own
 * descriptor's id; that is what a version 1 descriptor reads as.
 */
export function loadCatalog(
  dir: string,
  options: { allowLocalRepos: boolean },
): Catalog {
  const schema = descriptorSchema(options);
  const descriptors = new Map<string, Descriptor>();
  const problems: Catalog['problems'] = [];
  /** Id → the file that took it. */
  const taken = new Map<string, string>();
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return { descriptors, problems };
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
    const ids = new Set([descriptor.id, ...descriptor.apps.map((a) => a.id)]);
    const clash = [...ids].find((id) => taken.has(id));
    if (clash !== undefined) {
      problems.push({
        file,
        problem: `the id ${clash} is already used by ${taken.get(clash)}`,
      });
      continue;
    }
    for (const id of ids) taken.set(id, file);
    descriptors.set(descriptor.id, descriptor);
  }
  return { descriptors, problems };
}
