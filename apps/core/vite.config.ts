import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
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
 * A `.br` (brotli at its best quality) and a `.gz` beside each compressible
 * file under `assets/`, made once here so the backend never compresses per
 * request (`apps/backend/src/static-assets.ts` sends them). A copy that saves
 * less than a tenth is not written. On 2026-11-23's build: 15.9 MiB of such
 * files became 3.1 MiB as brotli and 4.0 MiB as gzip.
 */
function precompress(): Plugin {
  return {
    name: "imbatranim:precompress",
    apply: "build",
    async writeBundle(options, bundle) {
      const dir = options.dir ?? "dist";
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
                [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
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
