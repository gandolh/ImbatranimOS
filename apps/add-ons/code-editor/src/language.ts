/**
 * Map a file's lowercase extension to a Monaco language id.
 *
 * Kept in its own module (not the component) so the manifest / setup can reuse
 * it without tripping react-refresh's only-export-components rule. Only the
 * languages Monaco's bundled grammars support are worth mapping; anything
 * unknown falls back to `plaintext`, which still renders and edits fine.
 */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  py: 'python',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sql: 'sql',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  dockerfile: 'dockerfile',
}

/** Last `.`-delimited segment of a filename, lowercased (empty when none). */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

/**
 * Best-effort Monaco language id for a path, by extension. Unknown / extensionless
 * files (e.g. `Dockerfile`, `LICENSE`) fall back to `plaintext`.
 */
export function languageForPath(path: string): string {
  const base = path.split('/').pop() ?? path
  const ext = extensionOf(base)
  if (ext && EXTENSION_LANGUAGE_MAP[ext]) return EXTENSION_LANGUAGE_MAP[ext]
  // A few extensionless files map by their whole name.
  if (base.toLowerCase() === 'dockerfile') return 'dockerfile'
  return 'plaintext'
}
