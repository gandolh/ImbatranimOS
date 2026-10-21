import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import type * as KitNamespace from '@imbatranim/ui'
import {
  Button,
  Checkbox,
  ConfirmDialog,
  ContextMenu,
  Dialog,
  FileConflictDialog,
  FileConflictError,
  Input,
  PROTOCOL_VERSION,
  PromptDialog,
  SHARED_KIT_MODULES,
  SHARED_KIT_VERSION,
  ScrollArea,
  Select,
  Separator,
  SystemProvider,
  Tooltip,
  UnsavedChangesDialog,
  UploadTooLargeError,
  cn,
  describeFileFailure,
  fileName,
  installMapGetOrInsert,
  isTextEntry,
  queryClient,
  reportFileFailure,
  reportFileRefusal,
  resetOpenedFilesForTest,
  saveOverRead,
  useConfirm,
  useDocumentedShortcuts,
  useElementSize,
  useFileConflict,
  useFileDialog,
  useOpenIntent,
  usePrompt,
  useRegisteredHotkeys,
  useSaveHotkey,
  useSystem,
  useSystemAppearance,
  useTopWindowKeydown,
  useUnsavedGuard,
  useVirtualList,
  useWindowVisible,
  type SharedKitModule,
} from '@imbatranim/ui'

/**
 * Every value `@imbatranim/ui` exports, by name. Named imports rather than
 * `import * as`: a namespace import makes the bundler build the kit's whole
 * namespace object in the chunk the kit lives in, which is the desktop's
 * eager one, and pulls every kit module (the virtual list and its library
 * among them) into the first page load. Named, each module stays in the chunk
 * that already needed it, and the rest load with this host.
 *
 * The type keeps the list whole: an export added to the kit and not here,
 * or a name here the kit no longer has, fails the typecheck.
 */
const KIT: { [K in keyof typeof KitNamespace]: (typeof KitNamespace)[K] } = {
  Button,
  Checkbox,
  ConfirmDialog,
  ContextMenu,
  Dialog,
  FileConflictDialog,
  FileConflictError,
  Input,
  PROTOCOL_VERSION,
  PromptDialog,
  SHARED_KIT_MODULES,
  SHARED_KIT_VERSION,
  ScrollArea,
  Select,
  Separator,
  SystemProvider,
  Tooltip,
  UnsavedChangesDialog,
  UploadTooLargeError,
  cn,
  describeFileFailure,
  fileName,
  installMapGetOrInsert,
  isTextEntry,
  queryClient,
  reportFileFailure,
  reportFileRefusal,
  resetOpenedFilesForTest,
  saveOverRead,
  useConfirm,
  useDocumentedShortcuts,
  useElementSize,
  useFileConflict,
  useFileDialog,
  useOpenIntent,
  usePrompt,
  useRegisteredHotkeys,
  useSaveHotkey,
  useSystem,
  useSystemAppearance,
  useTopWindowKeydown,
  useUnsavedGuard,
  useVirtualList,
  useWindowVisible,
}

/** One shared module: every export of it, as a readable property. */
export type SharedModule = Readonly<Record<string, unknown>>

/** `globalThis.__imbatranimShared` (brief 163, contract A). */
export type SharedKitGlobal = Readonly<{
  version: number
  modules: Readonly<Record<SharedKitModule, SharedModule>>
}>

const GLOBAL = '__imbatranimShared'

/**
 * A frozen copy of a module namespace. A copy because a real ES namespace
 * cannot be frozen (its bindings are live), which is what the dev server and
 * the test runner hand over; the values are the same objects, so identity
 * holds. A CommonJS package (React) arrives as a namespace whose `default` is
 * its `module.exports`, with named exports beside it or not depending on the
 * bundler's interop, so its exports are spread from there first: every one is
 * then a property, whichever bundler built the desktop. React is already in
 * the eager bundle whole, so its namespaces cost nothing here.
 */
function frozenModule(ns: object): SharedModule {
  const cjs = (ns as { default?: unknown }).default
  const exports = cjs !== null && (typeof cjs === 'object' || typeof cjs === 'function') ? cjs : {}
  return Object.freeze({ ...exports, ...ns })
}

/** The shared kit as it stands, for reading. Undefined until {@link installSharedKit}. */
export function sharedKit(): SharedKitGlobal | undefined {
  return (globalThis as { [GLOBAL]?: SharedKitGlobal })[GLOBAL]
}

/**
 * Put the desktop's own React, React DOM and UI kit on the global a kit app's
 * build reads its imports from (brief 163). Called before the first kit app's
 * module is imported; the module reads the global as it evaluates. Once per
 * page: the property is frozen, read-only and cannot be redefined, so an app
 * cannot swap a module out from under the others.
 *
 * Never visible to a sandboxed URL app: its frame is another realm with its
 * own global.
 */
export function installSharedKit(): SharedKitGlobal {
  const existing = sharedKit()
  if (existing) return existing
  const shared: SharedKitGlobal = Object.freeze({
    version: SHARED_KIT_VERSION,
    modules: Object.freeze({
      react: frozenModule(React),
      'react/jsx-runtime': frozenModule(JsxRuntime),
      'react-dom': frozenModule(ReactDom),
      'react-dom/client': frozenModule(ReactDomClient),
      '@imbatranim/ui': frozenModule(KIT),
    }),
  })
  Object.defineProperty(globalThis, GLOBAL, {
    value: shared,
    writable: false,
    enumerable: false,
    configurable: false,
  })
  return shared
}
