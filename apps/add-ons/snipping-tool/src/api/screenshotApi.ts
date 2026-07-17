import { api } from '@imbatranim/core'

/**
 * Where saved screenshots land, relative to the `home` files root
 * (~/Pictures/Screenshots). The upload endpoint mkdir -p's parent dirs, so the
 * folder is created on first save.
 */
const SCREENSHOTS_DIR = 'Pictures/Screenshots'

/** `screenshot-YYYY-MM-DD-HHMMSS.png` in local time. */
export function screenshotFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `screenshot-${stamp}.png`
}

/** Upload a PNG blob to ~/Pictures/Screenshots via the authed files API. */
export async function saveScreenshot(blob: Blob): Promise<string> {
  const name = screenshotFilename()
  const path = `${SCREENSHOTS_DIR}/${name}`
  const file = new File([blob], name, { type: 'image/png' })
  const formData = new FormData()
  formData.append('root', 'home')
  formData.append('path', path)
  formData.append('file', file)
  await api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return path
}
