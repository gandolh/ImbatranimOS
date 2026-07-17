/** Must match the manifest `name` — used to filter the tool's own taskbar
 * button out of the rasterized shot. Lives in its own tiny module so the
 * manifest can read it without statically importing the (lazy) component. */
export const APP_NAME = 'Snipping Tool'
