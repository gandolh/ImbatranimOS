import { describe, expect, it } from 'vitest'
import type { OpenerResolution } from '@imbatranim/ui'
import { buildMenuItems, type BuildMenuItemsCtx } from './buildMenuItems'
import { marketplaceGap } from './marketplaceOpeners'
import { newFileOpener } from './newFileTemplates'
import type { Associations } from './openWith'

/**
 * Brief 164: New → Document and New → Spreadsheet name no app. They open in
 * whatever the OS resolves for the new file's name, and the menu leaves a kind
 * out while nothing installed opens it.
 */

function assocWith(table: Record<string, OpenerResolution>): Associations {
  return {
    resolveOpener: (name) => {
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
      return table[ext] ?? { appId: '', reason: 'none' }
    },
    candidatesFor: () => [],
    allCandidates: () => [],
    keyFor: (name) => name.slice(name.lastIndexOf('.') + 1).toLowerCase(),
    openerName: () => null,
    setDefault: () => undefined,
  }
}

const suite = assocWith({
  docx: { appId: 'office-docs', reason: 'declared' },
  xlsx: { appId: 'office-sheets', reason: 'declared' },
})
const nothing = assocWith({})

function backgroundMenu(assoc: Associations): string[] {
  const noop = () => undefined
  const ctx = {
    entry: null,
    root: 'home',
    assoc,
    hasClipboard: false,
    onOpen: noop,
    onOpenWith: noop,
    onDownload: noop,
    onRename: noop,
    onCopy: noop,
    onCut: noop,
    onDelete: noop,
    onNewFile: noop,
    onNewFolder: noop,
    onProperties: noop,
    onNewOfficeFile: noop,
    onUpload: noop,
    onPaste: noop,
    onRefresh: noop,
    onExtract: noop,
    onCompress: noop,
    onCompare: null,
    onEditInPaint: noop,
  } as unknown as BuildMenuItemsCtx
  return buildMenuItems(ctx).map((item) => ('label' in item ? String(item.label) : '—'))
}

describe('newFileOpener', () => {
  it('asks the associations for the new file, and takes their answer', () => {
    expect(newFileOpener(suite, 'document')).toBe('office-docs')
    expect(newFileOpener(suite, 'spreadsheet')).toBe('office-sheets')
  })

  it("follows the owner's own choice for the type", () => {
    const chosen = assocWith({ docx: { appId: 'my-writer', reason: 'override' } })
    expect(newFileOpener(chosen, 'document')).toBe('my-writer')
  })

  it('is null when nothing installed opens the kind, and never the text editor', () => {
    expect(newFileOpener(nothing, 'document')).toBeNull()
    const text = assocWith({ docx: { appId: 'code-editor', reason: 'text-fallback' } })
    expect(newFileOpener(text, 'document')).toBeNull()
  })
})

describe('the New items in the background menu', () => {
  it('offers Document and Spreadsheet while an app opens them', () => {
    const labels = backgroundMenu(suite)
    expect(labels).toContain('New Document')
    expect(labels).toContain('New Spreadsheet')
  })

  it('leaves them out when nothing does', () => {
    const labels = backgroundMenu(nothing)
    expect(labels).not.toContain('New Document')
    expect(labels).not.toContain('New Spreadsheet')
    expect(labels).toContain('New Folder')
  })
})

describe('marketplaceGap', () => {
  it('names Office for a .docx', () => {
    expect(marketplaceGap('docx')).toBe(
      'No installed app opens .docx files. Office in Settings → Marketplace does.'
    )
  })

  it('names Office for a .pptx, and not for a .ppt it refuses (brief 165)', () => {
    expect(marketplaceGap('pptx')).toBe(
      'No installed app opens .pptx files. Office in Settings → Marketplace does.'
    )
    // Office's Slides refuses PowerPoint 97-2003 by name: no Marketplace
    // sentence, and no nudge towards the text editor either.
    expect(marketplaceGap('ppt')).toBe(
      "No app here opens .ppt files (PowerPoint 97-2003). Office's Slides opens .pptx."
    )
  })

  it('says nothing for a type no Marketplace app is known to open', () => {
    expect(marketplaceGap('bin')).toBeNull()
    expect(marketplaceGap('constructor')).toBeNull()
  })
})
