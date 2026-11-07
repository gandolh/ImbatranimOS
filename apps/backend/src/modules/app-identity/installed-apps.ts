import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';

import type { Env } from '../../config/env.schema';
import { DbService } from '../../db/db.service';
import { loadCatalog } from '../marketplace/catalog';
import { installGroupOf } from './install-group';

/**
 * Which apps the catalog offers, and whether each is installed.
 *
 * A built-in is told apart from an installed app only by no installed
 * descriptor holding it ({@link installGroupOf}), so a catalog app that was
 * uninstalled, or never installed, would read as a built-in and be given the
 * `system` group. An open window of an app being uninstalled can still ask for
 * a token, and a write it started can still be waiting its turn. So the token
 * route refuses such an app, and the data folders refuse its writes, from the
 * moment its uninstall starts ({@link whileLeaving}).
 */
@Injectable()
export class InstalledApps {
  /** Apps an uninstall is taking out now, with how many uninstalls hold each. */
  private readonly leaving = new Map<string, number>();

  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Every app id the in-repo catalog offers, installed or not. Read on every
   * call, as the marketplace reads it: a handful of small files.
   */
  catalogAppIds(): Set<string> {
    const { descriptors } = loadCatalog(
      resolve(this.config.get('MARKETPLACE_DIR')),
      { allowLocalRepos: this.config.get('MARKETPLACE_ALLOW_LOCAL_REPOS') },
    );
    return new Set(
      [...descriptors.values()].flatMap((d) => d.apps.map((a) => a.id)),
    );
  }

  /** An app the catalog offers that no installed descriptor holds. */
  isUninstalledCatalogApp(appId: string): boolean {
    return (
      this.catalogAppIds().has(appId) &&
      installGroupOf(this.dbs, appId) === null
    );
  }

  /**
   * An app that may not act as itself: one being uninstalled, or a catalog
   * app that isn't installed.
   */
  isGone(appId: string): boolean {
    return this.leaving.has(appId) || this.isUninstalledCatalogApp(appId);
  }

  /**
   * Run an uninstall with its apps marked as leaving. Until it ends they get
   * no token and write no data, so a window still open can't put back what
   * it removes. If it fails, the apps are still installed and stop leaving.
   */
  async whileLeaving<T>(
    appIds: readonly string[],
    work: () => Promise<T>,
  ): Promise<T> {
    for (const id of appIds)
      this.leaving.set(id, (this.leaving.get(id) ?? 0) + 1);
    try {
      return await work();
    } finally {
      for (const id of appIds) {
        const held = (this.leaving.get(id) ?? 1) - 1;
        if (held > 0) this.leaving.set(id, held);
        else this.leaving.delete(id);
      }
    }
  }
}
