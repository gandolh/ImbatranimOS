import { useState } from 'react'
import { Button, Dialog, useConfirm } from '@imbatranim/ui'
import {
  CLEAN_OUT_CONFIRM,
  cleanOutOldData,
  closeOldDataNotice,
  downloadOldData,
  oldDataApps,
  oldDataError,
  useOldDataStore,
} from '../store/oldDataStore'

/**
 * The sign-in notice for older data the data moves set aside. Two ways out:
 * Download saves a `.tar.gz` of the apps' own files through the Save dialog
 * and then offers the clean-out; Clean out drops it after one more question.
 * Closing it picks neither, so it asks again at the next sign-in. Mounted
 * once at the desktop root, beside the file portal.
 */
export function OldDataNoticeHost() {
  const step = useOldDataStore((s) => s.step)
  const status = useOldDataStore((s) => s.status)
  const savedTo = useOldDataStore((s) => s.savedTo)
  const { confirm, confirmDialog } = useConfirm()
  // While the Save dialog or the confirmation is up, this one steps aside:
  // two modal dialogs would fight over the focus.
  const [away, setAway] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setError(null)
    setAway(true)
    try {
      const path = await downloadOldData()
      if (path) useOldDataStore.setState({ step: 'saved' })
    } catch (err) {
      setError(oldDataError(err))
    } finally {
      setAway(false)
    }
  }

  const cleanOut = async () => {
    setError(null)
    setAway(true)
    const ok = await confirm(CLEAN_OUT_CONFIRM)
    setAway(false)
    if (!ok) return
    setBusy(true)
    try {
      await cleanOutOldData()
      closeOldDataNotice()
    } catch (err) {
      setError(oldDataError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog
        open={step !== 'closed' && !away}
        onOpenChange={(open) => {
          if (!open) closeOldDataNotice()
        }}
        title="Older data"
      >
        <div className="flex max-w-[420px] flex-col gap-3">
          {step === 'saved' ? (
            <p>
              Saved to <span className="font-semibold">{savedTo}</span>. The older data stays until
              you clean it out, here or later in Settings, under Storage.
            </p>
          ) : (
            <>
              <p>Incompatible older data was found for {oldDataApps(status)}.</p>
              <p className="text-on-surface-variant">
                Download it as an archive of the apps&apos; own files, or clean it out. Until you
                pick one, this asks again at every sign-in.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="default" size="sm" onClick={closeOldDataNotice} disabled={busy}>
              {step === 'saved' ? 'Close' : 'Later'}
            </Button>
            <Button variant="default" size="sm" onClick={() => void cleanOut()} disabled={busy}>
              Clean out…
            </Button>
            {step === 'ask' && (
              <Button variant="primary" size="sm" onClick={() => void download()} disabled={busy}>
                Download…
              </Button>
            )}
          </div>
        </div>
      </Dialog>
      {confirmDialog}
    </>
  )
}
