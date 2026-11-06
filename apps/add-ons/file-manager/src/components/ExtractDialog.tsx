import { useState } from 'react'
import { Button, Dialog, useSystem } from '@imbatranim/ui'

/** What is being extracted, for the dialog to name. */
export type ExtractPrompt = {
  /** The archive file's name. */
  archiveName: string
  /** What goes out: "everything", "3 items", or one entry's name. */
  what: string
}

/**
 * Extract asks where. The default is the rule the backend already applies: a
 * folder named after the archive, beside it, numbered when the name is taken.
 * "Choose folder…" swaps it for a folder of the owner's pick, and the files go
 * straight into that folder.
 */
export function ExtractDialog({
  request,
  root,
  onExtract,
  onClose,
}: {
  request: ExtractPrompt
  /** The archive's root: the backend extracts inside one root. */
  root: string
  /** `dest` is undefined for the default rule. */
  onExtract: (dest: string | undefined) => void
  onClose: () => void
}) {
  const { fs } = useSystem()
  const [dest, setDest] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  async function choose() {
    setError(null)
    const picked = await fs.pickDirectory({ title: 'Extract to' })
    if (!picked) return
    if (picked.root !== root) {
      setError('Pick a folder in the same place as the archive.')
      return
    }
    setDest(picked.path)
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Extract"
      description={`${request.what} from ${request.archiveName}`}
    >
      <div className="flex flex-col gap-3">
        <div className="font-ui text-[12px]" data-testid="extract-dest">
          {dest === undefined ? (
            <>
              Into a new folder named after the archive, beside it.
              <span className="text-on-surface-variant"> Nothing existing is replaced.</span>
            </>
          ) : (
            <>
              Into <span className="font-semibold">{dest === '' ? 'the top folder' : dest}</span>
            </>
          )}
        </div>
        {error && <div className="text-error font-ui text-[12px]">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="default" size="sm" onClick={() => void choose()}>
            Choose folder…
          </Button>
          <Button variant="default" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onExtract(dest)
              onClose()
            }}
          >
            Extract
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
