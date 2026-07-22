import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Sub-path base for a Caddy sub-path deploy (e.g. /imbatranim-os/). Left at "/"
// for local dev and the default same-origin container. The vps-deploy container
// build passes VITE_BASE (paired with VITE_API_URL) so assets, REST, and the
// pty WebSocket (see repl-interpreter/src/ptyUrl.ts) all resolve under the
// prefix; Caddy's handle_path strips it back off before the container.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
