import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { defineConfig, loadEnv, type Plugin, type ProxyOptions, type Rolldown } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { ISOLATION_HEADERS } from "../backend/src/security-headers.ts";

const CORE_DIR = fileURLToPath(new URL(".", import.meta.url));
const BACKEND_DIR = fileURLToPath(new URL("../backend", import.meta.url));

/**
 * Local dev on one origin, the way Caddy serves the deploy: the API under
 * `<base>api` with the base stripped (its `handle_path`), WebSockets included
 * for the Terminal's pty. One origin is what lets the session cookie and the
 * Origin checks behave as they do in the deploy.
 */
function devProxy(base: string, backendPort: string) {
  const prefix = base.replace(/\/+$/, "");
  const proxy: Record<string, ProxyOptions> = {
    [`${prefix}/api`]: {
      target: `http://localhost:${backendPort}`,
      ws: true,
      rewrite: (url) => url.slice(prefix.length),
    },
  };
  return proxy;
}

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** What compresses: scripts, styles, SVG, JSON, WebAssembly and the one TrueType font. woff2 is already compressed. */
const COMPRESSIBLE = /\.(?:js|mjs|css|svg|json|wasm|ttf)$/;
/** Below this a compressed copy saves less than its own request headers. */
const MIN_BYTES = 1024;

/**
 * Brotli's best quality, for what every visit downloads; one step lower
 * costs a fourteenth of the time for about 9% more bytes (2026-11-23: all
 * 15.9 MiB took 24.4 s at 11 and 1.7 s at 9 on one core), which suits the
 * chunks of apps opened later. A one-CPU build server pays the difference.
 */
const BROTLI_FIRST_LOAD = constants.BROTLI_MAX_QUALITY;
const BROTLI_LATER = 9;

/**
 * What the built `index.html` loads before any app opens: the entry chunks,
 * every chunk they import statically, and those chunks' stylesheets.
 */
function firstLoad(bundle: Rolldown.OutputBundle): Set<string> {
  const names = new Set<string>();
  const visit = (fileName: string) => {
    if (names.has(fileName)) return;
    names.add(fileName);
    const file = bundle[fileName];
    if (file?.type !== "chunk") return;
    file.imports.forEach(visit);
    file.viteMetadata?.importedCss.forEach((css) => names.add(css));
  };
  for (const file of Object.values(bundle)) if (file.type === "chunk" && file.isEntry) visit(file.fileName);
  return names;
}

/**
 * A `.br` and a `.gz` beside each compressible file under `assets/`, made once
 * here so the backend never compresses per request
 * (`apps/backend/src/static-assets.ts` sends them). A copy that saves less
 * than a tenth is not written. On 2026-11-23's build: 15.9 MiB of such files
 * became 3.1 MiB as brotli and 4.0 MiB as gzip.
 */
function precompress(): Plugin {
  return {
    name: "imbatranim:precompress",
    apply: "build",
    async writeBundle(options, bundle) {
      const dir = options.dir ?? "dist";
      const eager = firstLoad(bundle);
      const jobs = Object.values(bundle).flatMap((file) => {
        if (!file.fileName.startsWith("assets/") || !COMPRESSIBLE.test(file.fileName)) return [];
        const source = file.type === "chunk" ? file.code : file.source;
        const bytes = typeof source === "string" ? Buffer.from(source, "utf8") : Buffer.from(source);
        if (bytes.length < MIN_BYTES) return [];
        const path = join(dir, file.fileName);
        const write = async (suffix: string, made: Promise<Buffer>) => {
          const out = await made;
          if (out.length < bytes.length * 0.9) await writeFile(path + suffix, out);
        };
        return [
          write(
            ".br",
            brotli(bytes, {
              params: {
                [constants.BROTLI_PARAM_QUALITY]: eager.has(file.fileName) ? BROTLI_FIRST_LOAD : BROTLI_LATER,
                [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
              },
            }),
          ),
          write(".gz", gzipped(bytes, { level: constants.Z_BEST_COMPRESSION })),
        ];
      });
      await Promise.all(jobs);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Sub-path base for a Caddy sub-path deploy (/imbatranim-os/). The vps-deploy
  // container build passes VITE_BASE (paired with VITE_API_URL) so assets, REST
  // and the pty WebSocket (see repl-interpreter/src/ptyUrl.ts) all resolve under
  // the prefix, and Caddy's handle_path strips it back off. Read through
  // `loadEnv` so local dev can set it in `.env.development` too; the build's
  // own environment still wins over any file.
  const base = loadEnv(mode, CORE_DIR, "VITE_BASE").VITE_BASE || "/";
  const backendPort = loadEnv(mode, BACKEND_DIR, "PORT").PORT || "3001";

  return {
    base,
    plugins: [react(), tailwindcss(), precompress()],
    build: {
      // Monaco, the editor in the Code Editor and the Diff tool, is a chunk of 2,736 kB (706 kB gzip), and the rest
      // of it a second of 1,314 kB. Both load when one of those two apps opens, never with the desktop. Cut into
      // pieces of 500 kB with a codeSplitting group, it broke (2026-11-25): its modules import each other in circles,
      // and opening the editor ran a piece before the one defining a class it builds ("c is not a constructor"). So
      // Monaco stays whole and the warning starts above it. The desktop's entry chunk was 427 kB that day.
      chunkSizeWarningLimit: 2_800,
    },
    server: {
      proxy: devProxy(base, backendPort),
      // In dev this server, not the backend, serves the desktop's page and
      // its workers, so it sends the isolation headers the backend sends in
      // the deploy. Without them `crossOriginIsolated` is false here. They
      // are a copy (a value import from the backend makes Vite warn on every
      // start), held to EMBEDDER_POLICY by the type check: switch that one,
      // and this one fails to compile until it matches. The CSP stays the
      // deploy's alone: Vite's HMR preamble is inline script.
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      } satisfies typeof ISOLATION_HEADERS,
    },
  };
});
