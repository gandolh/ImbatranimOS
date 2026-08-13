/**
 * @imbatranim/core — the public surface add-ons may import.
 *
 * Everything an add-on needs crosses this barrel; deep imports into core
 * internals are forbidden (enforced by eslint no-restricted-imports in the
 * add-on packages). Keep this surface deliberate: adding an export here is
 * an API decision, not a convenience.
 */

// Add-on contract
export type { AppConfig, AddonManifest } from './contract'
export type { CommandSource, CommandItem } from './shared/commands/CommandSourcesRegistry'

// HTTP + query plumbing
export { api } from './lib/axios'
export { queryClient } from './lib/queryClient'

// compat re-exports from @imbatranim/ui — removed when add-ons migrate (brief 48)
// The pure UI kit now lives in @imbatranim/ui; add-ons still import these from
// '@imbatranim/core', so re-export them here until a later wave re-points the
// add-ons and prunes this block.
export {
  cn,
  Button,
  Checkbox,
  Dialog,
  Input,
  ScrollArea,
  Select,
  Separator,
  Tooltip,
  ConfirmDialog,
  useConfirm,
  PromptDialog,
  usePrompt,
  createOpenedFileStore,
  useVirtualList,
} from '@imbatranim/ui'
export type { OpenedFile, VirtualList } from '@imbatranim/ui'

// Desktop shell access
export { openApp } from './shared/intents/openApp'
export { useIntentStore } from './shared/store/intentStore'
export { useWindowStore } from './shared/store/windowStore'

// Notifications — imperative `notify(...)` + the store hook for reactive reads
export { notify, useNotificationStore } from './shared/store/notificationStore'
export type {
  NotificationItem,
  NotifyInput,
  NotificationLevel,
} from './shared/store/notificationStore'

// Shared add-on kit — file bytes over the authed api client
export {
  fetchFileBytes,
  uploadFileBytes,
  UploadTooLargeError,
  downloadUrl,
  fileName,
} from './lib/fileBytes'

// System seam (brief 48). The versioned SystemHandle protocol + per-window
// context live in @imbatranim/ui (avoids a core↔ui type cycle); core owns the
// in-process implementation, injected per window by the compositor. Add-ons get
// the handle as a `system` prop; `useSystem()` is offered for deep-tree reads.
export { SystemProvider, useSystem, PROTOCOL_VERSION } from '@imbatranim/ui'
export type {
  SystemHandle,
  SystemFs,
  SystemHttp,
  SystemWindow,
  SystemIntents,
  SystemEvent,
  FsEntry,
  FsEntryType,
} from '@imbatranim/ui'

// Shared add-on kit — editor hooks + modal file picker. These now live in
// @imbatranim/ui, implemented over the injected `system` handle; re-exported
// here so existing add-ons keep importing them from '@imbatranim/core'
// unchanged (they render inside the per-window SystemProvider).
export { useOpenIntent, useSaveHotkey, useUnsavedGuard } from '@imbatranim/ui'
export { OpenFilePicker, useOpenFilePicker } from '@imbatranim/ui'
export type { PickedFile, OpenFilePickerOptions } from '@imbatranim/ui'
