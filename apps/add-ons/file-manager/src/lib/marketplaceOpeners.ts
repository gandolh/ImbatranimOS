/**
 * File types only a Marketplace app opens, by the name the Marketplace lists
 * it under. The built-in office apps moved to imbatranim-apps,
 * so with Office not installed a `.docx` has no claimant, and the Open With
 * chooser names where to get one instead of offering the text editor.
 *
 * One line per type the suite took over; each retirement run adds its own.
 */
const OFFICE = { name: 'Office', descriptorId: 'imbatranim-office' }

const SUITE_TYPES: Readonly<Record<string, { name: string; descriptorId: string }>> = {
  docx: OFFICE,
  pptx: OFFICE,
  xlsx: OFFICE,
  pdf: OFFICE,
  // A .csv opens in the text editor while nothing claims it, so
  // this shows only when that editor is disabled too.
  csv: OFFICE,
}

/**
 * Old binary formats a retired built-in opened and the suite refuses by name
 *, so nothing opens them, installed or not. The chooser says so
 * rather than suggesting the text editor.
 */
const REFUSED_TYPES: Readonly<Record<string, string>> = {
  ppt: "No app here opens .ppt files (PowerPoint 97-2003). Office's Slides opens .pptx.",
  xls: "No app here opens .xls files (Excel 97-2003). Office's Sheets opens .xlsx.",
}

/** The Marketplace entry that opens `key`: its name, and the descriptor id Settings scrolls to. */
export function marketplaceTarget(key: string): { name: string; descriptorId: string } | null {
  return Object.hasOwn(SUITE_TYPES, key) ? SUITE_TYPES[key] : null
}

/**
 * The intent payload that opens Settings at Marketplace, scrolled to the row
 * of one descriptor.
 */
export function marketplaceIntent(descriptorId: string): { marketplace: string } {
  return { marketplace: descriptorId }
}

/**
 * The sentence the chooser shows when nothing installed opens `key` (an
 * extension, as the associations key it), or null when no Marketplace app
 * is known to open it.
 */
export function marketplaceGap(key: string): string | null {
  if (Object.hasOwn(REFUSED_TYPES, key)) return REFUSED_TYPES[key]
  const target = marketplaceTarget(key)
  return target
    ? `No installed app opens .${key} files. ${target.name} in Settings → Marketplace does.`
    : null
}
