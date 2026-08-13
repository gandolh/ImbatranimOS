/**
 * @imbatranim/ui — the pure UI library shared across the web OS.
 *
 * Everything here is client-only: components, hooks, and stores that render or
 * manage local state with no dependency on the authed api client, the desktop
 * shell, or any @imbatranim/core store. Extracted from core in brief 48 (the
 * protocol seam) so add-ons and future system/ protocol code can consume the
 * kit without pulling in the desktop runtime.
 */

// Styling helper
export { cn } from './lib/cn'

// UI kit
export { Button } from './components/Button'
export { Checkbox } from './components/Checkbox'
export { Dialog } from './components/Dialog'
export { Input } from './components/Input'
export { ScrollArea } from './components/ScrollArea'
export { Select } from './components/Select'
export { Separator } from './components/Separator'
export { Tooltip } from './components/Tooltip'

// Confirm / prompt dialogs (+ imperative hooks)
export { ConfirmDialog, useConfirm } from './components/ConfirmDialog'
export type { ConfirmOptions } from './components/ConfirmDialog'
export { PromptDialog, usePrompt } from './components/PromptDialog'
export type { PromptOptions } from './components/PromptDialog'

// Opened-file store (zustand)
export { createOpenedFileStore } from './store/createOpenedFileStore'
export type { OpenedFile } from './store/createOpenedFileStore'

// Virtual list hook
export { useVirtualList } from './hooks/useVirtualList'
export type { VirtualList } from './hooks/useVirtualList'

// ── System seam (brief 48: the protocol seam) ────────────────────────────────
// The versioned capability protocol between the compositor and an app, the
// per-window context, and the app-side hooks + picker implemented over it.

// Protocol: the SystemHandle spec + its data types (values: version + error)
export { PROTOCOL_VERSION, UploadTooLargeError } from './system/protocol'
export type {
  SystemHandle,
  SystemFs,
  SystemHttp,
  SystemWindow,
  SystemIntents,
  SystemEvent,
  FsEntry,
  FsEntryType,
  HttpRequestConfig,
  HttpResponse,
  NotifyInput,
  NotifyLevel,
  OpenPayload,
} from './system/protocol'

// Per-window context
export { SystemProvider, useSystem } from './system/SystemContext'

// App-side hooks over useSystem()
export { useOpenIntent } from './system/useOpenIntent'
export { useSaveHotkey } from './system/useSaveHotkey'
export { useUnsavedGuard } from './system/useUnsavedGuard'

// Modal file picker over the injected FS capability
export { OpenFilePicker, useOpenFilePicker } from './components/OpenFilePicker'
export type { PickedFile, OpenFilePickerOptions } from './components/OpenFilePicker'
