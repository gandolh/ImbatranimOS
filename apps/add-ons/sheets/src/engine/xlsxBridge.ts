/**
 * Lazy bridge between xlsx bytes and Univer's workbook model, backed by
 * **ExcelJS** (MIT). ExcelJS is heavy and only pulled in on first open/save via
 * dynamic import, so it becomes its own build chunk and never lands in the
 * desktop boot bundle. Nothing here is imported at module top level (the
 * `import type` lines are erased at build time).
 *
 * SheetJS Community Edition was the original pick but its writer silently drops
 * cell styles (bold/fills/colors) — proven in the brief-20 spike — so it fails
 * the "basic styles survive open→edit→save" bar. ExcelJS reads *and* writes
 * fonts, fills, number formats and formulas, which the spike verified via an
 * independent openpyxl round-trip. This bridge maps the intersection Univer can
 * render: values, formulas, number formats, bold/italic, font color, and solid
 * cell fills.
 */
import type ExcelJS from 'exceljs'
import type { IWorkbookData, ICellData, IStyleData, IWorksheetData } from '@univerjs/presets'

// exceljs is CJS; grab whichever shape the interop hands back.
async function loadExcelJS(): Promise<typeof ExcelJS> {
  const mod = (await import('exceljs')) as unknown as {
    default?: typeof ExcelJS
  } & typeof ExcelJS
  return mod.default ?? mod
}

// ── Color helpers ──────────────────────────────────────────────────────────
// ExcelJS speaks 8-digit ARGB; Univer speaks CSS-ish hex. Normalize between.
function argbToHex(argb?: string | null): string | undefined {
  if (!argb) return undefined
  const h = argb.replace(/^#/, '')
  return '#' + h.slice(-6).toUpperCase()
}
function hexToArgb(hex?: string | null): string | undefined {
  if (!hex) return undefined
  return 'FF' + hex.replace(/^#/, '').slice(-6).toUpperCase()
}

// ── ExcelJS cell → Univer ──────────────────────────────────────────────────
function cellToUniverStyle(cell: ExcelJS.Cell): IStyleData | undefined {
  const st: IStyleData = {}
  const font = cell.font
  if (font?.bold) st.bl = 1
  if (font?.italic) st.it = 1
  const fontColor = argbToHex(font?.color?.argb)
  if (fontColor) st.cl = { rgb: fontColor }
  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const bg = argbToHex(fill.fgColor?.argb)
    if (bg) st.bg = { rgb: bg }
  }
  const nf = cell.numFmt
  if (nf && nf !== 'General') st.n = { pattern: nf }
  return Object.keys(st).length ? st : undefined
}

function cellValueToUniver(cell: ExcelJS.Cell): Pick<ICellData, 'v' | 'f'> {
  const v = cell.value
  if (v == null) return {}
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) {
      const formula = 'formula' in v ? v.formula : v.sharedFormula
      const out: Pick<ICellData, 'v' | 'f'> = { f: '=' + formula }
      const result = (v as { result?: unknown }).result
      if (result != null && typeof result !== 'object') {
        out.v = result as string | number | boolean
      }
      return out
    }
    if ('richText' in v && Array.isArray(v.richText)) {
      return { v: v.richText.map((r) => r.text).join('') }
    }
    if ('text' in v) return { v: String((v as { text: unknown }).text) }
    if ('hyperlink' in v) return { v: String((v as { hyperlink: unknown }).hyperlink) }
    if (v instanceof Date) return { v: v.toISOString() }
    return {}
  }
  return { v: v as string | number | boolean }
}

/** Parse xlsx bytes into a Univer workbook snapshot. */
export async function xlsxToUniver(bytes: ArrayBuffer): Promise<Partial<IWorkbookData>> {
  const ExcelJSLib = await loadExcelJS()
  const wb = new ExcelJSLib.Workbook()
  await wb.xlsx.load(bytes)

  const sheets: Record<string, Partial<IWorksheetData>> = {}
  const sheetOrder: string[] = []

  wb.eachSheet((ws, sheetIndex) => {
    const id = `sheet-${sheetIndex}`
    sheetOrder.push(id)
    const cellData: Record<number, Record<number, ICellData>> = {}
    let maxCol = 0

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const r = rowNumber - 1
        const c = colNumber - 1
        const uc: ICellData = { ...cellValueToUniver(cell) }
        const style = cellToUniverStyle(cell)
        if (style) uc.s = style
        if (uc.v !== undefined || uc.f !== undefined || uc.s !== undefined) {
          ;(cellData[r] ||= {})[c] = uc
          if (c > maxCol) maxCol = c
        }
      })
    })

    sheets[id] = {
      id,
      name: ws.name,
      cellData,
      columnCount: Math.max(maxCol + 1, 20),
    }
  })

  // A truly empty workbook still needs one sheet for Univer to mount.
  if (sheetOrder.length === 0) {
    sheets['sheet-1'] = { id: 'sheet-1', name: 'Sheet1', cellData: {} }
    sheetOrder.push('sheet-1')
  }

  return { id: 'imbatranim-sheets', name: 'Workbook', sheetOrder, sheets }
}

// ── Univer → ExcelJS ────────────────────────────────────────────────────────
function resolveStyle(
  raw: ICellData['s'],
  styles: IWorkbookData['styles'] | undefined
): IStyleData | undefined {
  if (!raw) return undefined
  if (typeof raw === 'string') return (styles?.[raw] as IStyleData) ?? undefined
  return raw
}

function applyUniverStyle(cell: ExcelJS.Cell, st: IStyleData | undefined): void {
  if (!st) return
  const font: Partial<ExcelJS.Font> = {}
  if (st.bl) font.bold = true
  if (st.it) font.italic = true
  const clRgb = st.cl && typeof st.cl === 'object' ? (st.cl.rgb as string | undefined) : undefined
  const cl = hexToArgb(clRgb)
  if (cl) font.color = { argb: cl }
  if (Object.keys(font).length) cell.font = font
  const bgRgb = st.bg && typeof st.bg === 'object' ? (st.bg.rgb as string | undefined) : undefined
  const bgArgb = hexToArgb(bgRgb)
  if (bgArgb) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
  }
  if (st.n && typeof st.n === 'object' && st.n.pattern) cell.numFmt = st.n.pattern
}

/** Serialize a Univer workbook snapshot back to xlsx bytes. */
export async function univerToXlsx(snapshot: IWorkbookData): Promise<ArrayBuffer> {
  const ExcelJSLib = await loadExcelJS()
  const wb = new ExcelJSLib.Workbook()

  for (const sheetId of snapshot.sheetOrder) {
    const sd = snapshot.sheets[sheetId]
    if (!sd) continue
    const ws = wb.addWorksheet(sd.name || sheetId)
    const cellData = sd.cellData ?? {}
    for (const rowKey of Object.keys(cellData)) {
      const r = Number(rowKey)
      const rowCells = cellData[Number(rowKey)] as Record<number, ICellData>
      for (const colKey of Object.keys(rowCells)) {
        const c = Number(colKey)
        const uc = rowCells[Number(colKey)]
        if (!uc) continue
        const cell = ws.getCell(r + 1, c + 1)
        if (uc.f) {
          cell.value = {
            formula: String(uc.f).replace(/^=/, ''),
            result: (uc.v ?? undefined) as string | number | boolean | undefined,
          }
        } else if (uc.v !== undefined && uc.v !== null) {
          cell.value = uc.v as string | number | boolean
        }
        applyUniverStyle(cell, resolveStyle(uc.s, snapshot.styles))
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}
