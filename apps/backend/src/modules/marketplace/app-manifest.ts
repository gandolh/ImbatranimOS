import { normalize } from 'path';
import { z } from 'zod';

import { entrySchema, iconSchema, windowSchema } from './catalog';

/**
 * `imbatranim.json`: the manifest of an app installed from a URL (brief 158,
 * contract A). It sits in the app's directory of the repository, beside the
 * prebuilt module it names.
 *
 * Unlike a catalog descriptor it is written by whoever owns the repository,
 * and nobody reviewed it, so it is strict: an unknown key is refused rather
 * than ignored, it names no commands (nothing from the repository runs on the
 * machine), and it does not choose its own id (that is derived from the
 * source, see `deriveAppId`).
 */

/** What an app from a URL may ask for. The rest hand over the owner's files or session, or reach other apps. */
export const URL_APP_CAPABILITIES = ['notify'] as const;

/** The manifest's file name, at the top of the app's directory. */
export const MANIFEST_FILE = 'imbatranim.json';

/** Bigger than any honest manifest: read no further than this. */
export const MAX_MANIFEST_BYTES = 64 * 1024;

const allowed: readonly string[] = URL_APP_CAPABILITIES;

/**
 * The largest window an app from a URL may open at, and the largest minimum
 * size it may set. A catalog descriptor may ask for up to 4000×4000: it was
 * reviewed. An app nobody reviewed gets a window the desktop stays visible
 * around, and one the owner can shrink.
 */
export const URL_APP_MAX_DEFAULT_SIZE = { w: 1600, h: 1000 } as const;
export const URL_APP_MAX_MIN_SIZE = { w: 800, h: 600 } as const;

const times = (s: { w: number; h: number }) => `${s.w}×${s.h}`;

/** The catalog's window shape, within {@link URL_APP_MAX_DEFAULT_SIZE} and {@link URL_APP_MAX_MIN_SIZE}. */
const urlAppWindowSchema = windowSchema.superRefine(
  ({ defaultSize, minSize }, ctx) => {
    const maxDefault = URL_APP_MAX_DEFAULT_SIZE;
    const maxMin = URL_APP_MAX_MIN_SIZE;
    if (defaultSize.w > maxDefault.w || defaultSize.h > maxDefault.h) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultSize'],
        message: `This app asks for a ${times(defaultSize)} window. An app installed from a URL may open at most ${times(maxDefault)}.`,
      });
    } else if (minSize.w > maxMin.w || minSize.h > maxMin.h) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSize'],
        message: `This app asks for a window of at least ${times(minSize)}. An app installed from a URL may ask for at most ${times(maxMin)}.`,
      });
    } else if (minSize.w > defaultSize.w || minSize.h > defaultSize.h) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSize'],
        message: `This app's smallest window, ${times(minSize)}, is larger than the ${times(defaultSize)} it opens at.`,
      });
    }
  },
);

export const appManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(60),
    description: z.string().max(300).default(''),
    meta: z.array(z.string().min(1).max(40)).max(8).default([]),
    // A dotfile is never served (see `resolveServed`), so an entry that is one,
    // or sits in one, could never load.
    entry: entrySchema.refine(
      (p) =>
        !normalize(p)
          .split('/')
          .some((s) => s.startsWith('.')),
      'must not be or sit in a dotfile',
    ),
    window: urlAppWindowSchema,
    // No `.max()`: an unknown capability is named below, whatever else the
    // list holds, and a duplicate is refused, which bounds it as well.
    capabilities: z
      .array(z.string().max(40))
      .default([])
      .superRefine((caps, ctx) => {
        for (const cap of caps) {
          if (!allowed.includes(cap)) {
            ctx.addIssue({
              code: 'custom',
              message: `This app asks for system.${cap}, which an app installed from a URL cannot have. Only ${allowed.join(', ')} is allowed.`,
            });
            return;
          }
        }
        if (new Set(caps).size !== caps.length) {
          ctx.addIssue({ code: 'custom', message: 'lists a capability twice' });
        }
      }),
    icon: iconSchema,
    minSystemVersion: z.number().int().min(1),
  })
  .strict();

export type AppManifest = z.infer<typeof appManifestSchema>;

/**
 * Parse a manifest, or say in one sentence what is wrong with it. The
 * sentence is what the Marketplace pane shows, so a refused capability or window
 * size is named on its own rather than as a schema path.
 */
export function parseManifest(
  raw: unknown,
): { ok: true; manifest: AppManifest } | { ok: false; problem: string } {
  const parsed = appManifestSchema.safeParse(raw);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  const issue = parsed.error.issues[0];
  if (
    (issue.path[0] === 'capabilities' || issue.path[0] === 'window') &&
    issue.code === 'custom'
  ) {
    return { ok: false, problem: issue.message };
  }
  const where = issue.path.join('.');
  return {
    ok: false,
    problem: `${MANIFEST_FILE}: ${where ? `${where}: ` : ''}${issue.message}`,
  };
}
