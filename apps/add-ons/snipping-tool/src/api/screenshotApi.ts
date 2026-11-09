import type { SystemFs } from '@imbatranim/ui'

/**
 * Where the Save dialog opens, relative to the `home` files root
 * (~/Pictures/Screenshots).
 */
const SCREENSHOTS_DIR = 'Pictures/Screenshots'

/**
 * `screenshot-YYYY-MM-DD-HHMMSS-mmm.png` in local time. The millisecond suffix
 * keeps two saves within the same second from silently overwriting each other.
 */
export function screenshotFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${ms}`
  return `screenshot-${stamp}.png`
}

/**
 * Save a PNG through the OS's Save dialog, opened at ~/Pictures/Screenshots
 * with a fresh name: the pick is what gives the Snipping Tool the path (it
 * reaches only what it is given), as Windows' Snipping Tool asks on every
 * save. Resolves the saved path, or null when the user cancelled.
 */
export async function saveScreenshot(fs: SystemFs, blob: Blob): Promise<string | null> {
  const name = screenshotFilename()
  const choice = await fs.pickSave({
    title: 'Save screenshot',
    suggestedName: name,
    extensions: ['png'],
    startIn: { root: 'home', path: `${SCREENSHOTS_DIR}/${name}` },
  })
  if (!choice) return null
  const saved = choice.path.split('/').pop() ?? name
  await fs.upload(choice.root, choice.path, await blob.arrayBuffer(), saved)
  return choice.root === 'home' ? `~/${choice.path}` : `${choice.root}:${choice.path}`
}
