import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
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
    plugins: [react(), tailwindcss()],
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
