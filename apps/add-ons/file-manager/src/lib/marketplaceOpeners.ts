/**
 * File types only a Marketplace app opens, by the name the Marketplace lists
 * it under (brief 164). The built-in office apps moved to imbatranim-office,
 * so with Office not installed a `.docx` has no claimant, and the Open With
 * chooser names where to get one instead of offering the text editor.
 *
 * One line per type the suite took over; each retirement run adds its own.
 */
const SUITE_TYPES: Readonly<Record<string, string>> = {
  docx: 'Office',
}

/**
 * The sentence the chooser shows when nothing installed opens `key` (an
 * extension, as the associations key it), or null when no Marketplace app
 * is known to open it.
 */
export function marketplaceGap(key: string): string | null {
  const suite = Object.hasOwn(SUITE_TYPES, key) ? SUITE_TYPES[key] : null
  return suite
    ? `No installed app opens .${key} files. ${suite} in Settings → Marketplace does.`
    : null
}
