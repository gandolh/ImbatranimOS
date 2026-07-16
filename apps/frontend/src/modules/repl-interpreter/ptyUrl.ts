/**
 * Build the terminal WebSocket URL for both dev and prod.
 *
 *  - dev:  Vite (:5173) and the API (:3001) are separate origins. The axios
 *          base URL `VITE_API_URL` (e.g. `http://localhost:3001/api`) tells us
 *          where the API lives; we reuse its host + path and swap the scheme
 *          to `ws`/`wss`, then append `/pty`.
 *  - prod: `VITE_API_URL` is unset — everything is same-origin, so derive the
 *          socket URL from `window.location`.
 *
 * `cols`/`rows` are passed as a query hint so the pty spawns at the right
 * geometry before the first resize frame arrives.
 */
export function buildPtyUrl(cols: number, rows: number): string {
  const query = `?cols=${cols}&rows=${rows}`;
  const base = import.meta.env.VITE_API_URL as string | undefined;

  if (base) {
    const u = new URL(base, window.location.href);
    const scheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = u.pathname.replace(/\/+$/, ''); // strip trailing slash
    return `${scheme}//${u.host}${path}/pty${query}`;
  }

  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/api/pty${query}`;
}
