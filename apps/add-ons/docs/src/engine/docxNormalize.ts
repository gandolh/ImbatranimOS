/**
 * docx normalization for SuperDoc round-trip.
 *
 * SuperDoc's docx exporter reads three parts **unconditionally** (via
 * `converter.convertedXml[part].elements[0]`, no null-guard): `word/styles.xml`,
 * `word/_rels/document.xml.rels`, and `docProps/custom.xml`. If any is absent,
 * export throws `TypeError: reading 'elements'` and `SuperDoc.export()` silently
 * falls back to the ORIGINAL bytes — so edits are lost on save. Minimal or
 * tool-generated docx files (and many real Word files, which omit custom.xml)
 * trip this.
 *
 * Fix: before handing bytes to SuperDoc, ensure those parts exist. Missing ones
 * get minimal valid stand-ins and are wired into `[Content_Types].xml` /
 * `_rels/.rels`. Files that already contain a part are left untouched, and a
 * docx that already has all three is returned byte-for-byte unchanged. `fflate`
 * is dynamically imported so it never lands in the desktop boot bundle.
 */

// A complete-enough styles part: SuperDoc's importer hangs on an *empty*
// `<w:styles/>`, so this carries `docDefaults` plus the four default styles Word
// always emits. Only used when the source has no styles.xml at all.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style></w:styles>`

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

const CUSTOM_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>`

const STYLES_PART = 'word/styles.xml'
const DOCUMENT_RELS_PART = 'word/_rels/document.xml.rels'
const CUSTOM_PART = 'docProps/custom.xml'
const CONTENT_TYPES = '[Content_Types].xml'
const PACKAGE_RELS = '_rels/.rels'

const STYLES_CT =
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
const CUSTOM_CT =
  '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>'
const CUSTOM_REL =
  '<Relationship Id="rIdImbatranimCustomProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>'

/**
 * Ensure a docx contains the parts SuperDoc's exporter requires. Returns the
 * original bytes untouched if nothing was missing; otherwise a repacked zip.
 */
export async function normalizeDocx(bytes: ArrayBuffer): Promise<Uint8Array> {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import('fflate')
  const original = new Uint8Array(bytes)

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(original)
  } catch {
    // Not a readable zip — hand the bytes back and let SuperDoc surface the error.
    return original
  }

  const addedStyles = !files[STYLES_PART]
  const addedRels = !files[DOCUMENT_RELS_PART]
  const addedCustom = !files[CUSTOM_PART]
  if (!addedStyles && !addedRels && !addedCustom) return original

  if (addedStyles) files[STYLES_PART] = strToU8(STYLES_XML)
  if (addedRels) files[DOCUMENT_RELS_PART] = strToU8(DOCUMENT_RELS_XML)
  if (addedCustom) files[CUSTOM_PART] = strToU8(CUSTOM_XML)

  // Wire new parts into [Content_Types].xml (idempotent: only if not declared).
  if (files[CONTENT_TYPES]) {
    let ct = strFromU8(files[CONTENT_TYPES])
    let extra = ''
    if (files[STYLES_PART] && !ct.includes('/word/styles.xml')) extra += STYLES_CT
    if (files[CUSTOM_PART] && !ct.includes('/docProps/custom.xml')) extra += CUSTOM_CT
    if (extra && ct.includes('</Types>')) {
      ct = ct.replace('</Types>', extra + '</Types>')
      files[CONTENT_TYPES] = strToU8(ct)
    }
  }

  // custom.xml is referenced from the package-level rels, not document.xml.rels.
  if (addedCustom && files[PACKAGE_RELS]) {
    let rels = strFromU8(files[PACKAGE_RELS])
    if (!rels.includes('custom-properties') && rels.includes('</Relationships>')) {
      rels = rels.replace('</Relationships>', CUSTOM_REL + '</Relationships>')
      files[PACKAGE_RELS] = strToU8(rels)
    }
  }

  return zipSync(files)
}
