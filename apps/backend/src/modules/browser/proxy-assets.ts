import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { dirname, join } from 'path';

/**
 * Every file the proxy origin serves (brief 50), by exact path. Anything not
 * listed is a 404: the origin has no directory to wander, and no route reaches
 * the desktop's files or API.
 *
 * Scramjet, bare-mux and the epoxy transport are served from their npm
 * packages' prebuilt `dist/` (no Rust or WASM toolchain anywhere); the three
 * small files that wire them together are ours, in `static/`.
 */
export interface ProxyAsset {
  file: string;
  type: string;
}

/** The directory holding a package's main entry, resolved from this file. */
function distOf(entry: string): string {
  return dirname(require.resolve(entry));
}

const JS = 'text/javascript; charset=utf-8';

export function proxyAssets(): ReadonlyMap<string, ProxyAsset> {
  const ours = join(__dirname, 'static');
  // `scramjetPath` and `epoxyPath` are the packages' own pointers at their dist.
  const bareMux = distOf('@mercuryworkshop/bare-mux');
  return new Map<string, ProxyAsset>([
    [
      '/host.html',
      { file: join(ours, 'host.html'), type: 'text/html; charset=utf-8' },
    ],
    ['/host.js', { file: join(ours, 'host.js'), type: JS }],
    ['/sw.js', { file: join(ours, 'sw.js'), type: JS }],
    [
      '/scram/scramjet.all.js',
      { file: join(scramjetPath, 'scramjet.all.js'), type: JS },
    ],
    [
      '/scram/scramjet.sync.js',
      { file: join(scramjetPath, 'scramjet.sync.js'), type: JS },
    ],
    [
      '/scram/scramjet.wasm.wasm',
      {
        file: join(scramjetPath, 'scramjet.wasm.wasm'),
        type: 'application/wasm',
      },
    ],
    ['/baremux/index.js', { file: join(bareMux, 'index.js'), type: JS }],
    ['/baremux/worker.js', { file: join(bareMux, 'worker.js'), type: JS }],
    ['/epoxy/index.mjs', { file: join(epoxyPath, 'index.mjs'), type: JS }],
  ]);
}
