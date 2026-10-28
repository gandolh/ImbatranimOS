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
  pptx: 'Office',
  xlsx: 'Office',
  // A .csv opens in the text editor while nothing claims it (brief 166), so
  // this shows only when that editor is disabled too.
  csv: 'Office',
}

/**
 * Old binary formats a retired built-in opened and the suite refuses by name
 * (briefs 165 and 166), so nothing opens them, installed or not. The chooser says so
 * rather than suggesting the text editor.
 */
const REFUSED_TYPES: Readonly<Record<string, string>> = {
  ppt: "No app here opens .ppt files (PowerPoint 97-2003). Office's Slides opens .pptx.",
  xls: "No app here opens .xls files (Excel 97-2003). Office's Sheets opens .xlsx.",
}

/**
 * The sentence the chooser shows when nothing installed opens `key` (an
 * extension, as the associations key it), or null when no Marketplace app
 * is known to open it.
 */
export function marketplaceGap(key: string): string | null {
  if (Object.hasOwn(REFUSED_TYPES, key)) return REFUSED_TYPES[key]
  const suite = Object.hasOwn(SUITE_TYPES, key) ? SUITE_TYPES[key] : null
  return suite
    ? `No installed app opens .${key} files. ${suite} in Settings → Marketplace does.`
    : null
}
