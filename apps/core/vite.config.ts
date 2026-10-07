import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const CORE_DIR = fileURLToPath(new URL('.', import.meta.url))
const BACKEND_DIR = fileURLToPath(new URL('../backend', import.meta.url))

/**
 * Local dev on one origin, the way Caddy serves the deploy: the API under
 * `<base>api` with the base stripped (its `handle_path`), WebSockets included
 * for the Terminal's pty. One origin is what lets the session cookie and the
 * Origin checks behave as they do in the deploy.
 */
function devProxy(base: string, backendPort: string) {
  const prefix = base.replace(/\/+$/, '')
  const proxy: Record<string, ProxyOptions> = {
    [`${prefix}/api`]: {
      target: `http://localhost:${backendPort}`,
      ws: true,
      rewrite: (url) => url.slice(prefix.length),
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

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: { proxy: devProxy(base, backendPort) },
  }
})
