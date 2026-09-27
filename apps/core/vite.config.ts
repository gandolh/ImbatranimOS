import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const CORE_DIR = fileURLToPath(new URL('.', import.meta.url))
const BACKEND_DIR = fileURLToPath(new URL('../backend', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Local dev on one origin, the way Caddy serves the deploy: the API under
 * `<base>api` with the base stripped (its `handle_path`), WebSockets included
 * for the Terminal's pty, and `/ward` + `/ward-api` to WARD_PUBLIC_ORIGIN — the
 * Ward the backend trusts, locally the container in wzd_auth/infrastructure/local.
 * One origin is what lets Ward's cookie, its redirect back to the app's root and
 * signing out work as they do in the deploy.
 *
 * Ward refuses /refresh and /logout unless the request's Origin is its own. A
 * request from a page on this dev server would be same-origin in the deploy, so
 * its Origin is rewritten to say so. Anything else keeps its Origin and its
 * Sec-Fetch-Site, and Ward still refuses it.
 */
function devProxy(base: string, backendPort: string, wardOrigin?: string) {
  const prefix = base.replace(/\/+$/, '')
  const proxy: Record<string, ProxyOptions> = {
    [`${prefix}/api`]: {
      target: `http://localhost:${backendPort}`,
      ws: true,
      rewrite: (url) => url.slice(prefix.length),
    },
  }
  if (!wardOrigin) return proxy

  const ward = new URL(wardOrigin).origin
  proxy['^/ward(-api)?(/|$)'] = {
    target: ward,
    configure: (server) => {
      server.on('proxyReq', (proxyReq, req) => {
        const origin = req.headers.origin
        if (origin && URL.canParse(origin) && new URL(origin).host === req.headers.host) {
          proxyReq.setHeader('origin', ward)
        }
      })
    },
  }
  return proxy
}

export default defineConfig(({ mode }) => {
  // Sub-path base for a Caddy sub-path deploy (/imbatranim-os/). The vps-deploy
  // container build passes VITE_BASE (paired with VITE_API_URL) so assets, REST
  // and the pty WebSocket (see repl-interpreter/src/ptyUrl.ts) all resolve under
  // the prefix, and Caddy's handle_path strips it back off. Read through
  // `loadEnv` so local dev can set it in `.env.development` too; the build's
  // own environment still wins over any file.
  const base = loadEnv(mode, CORE_DIR, 'VITE_BASE').VITE_BASE || '/'
  const backendPort = loadEnv(mode, BACKEND_DIR, 'PORT').PORT || '3001'
  const ward = loadEnv(mode, REPO_ROOT, 'WARD_PUBLIC_ORIGIN').WARD_PUBLIC_ORIGIN

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: { proxy: devProxy(base, backendPort, ward) },
  }
})
