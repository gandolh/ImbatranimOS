/**
 * Minimal ambient types for `pptx-preview` (the library ships no declarations).
 * Only the surface we call is described here.
 */
declare module 'pptx-preview' {
  export interface PptxPreviewOptions {
    width: number
    height: number
  }
  export interface PptxPreviewer {
    preview(data: ArrayBuffer | Uint8Array): void | Promise<void>
  }
  export function init(container: HTMLElement, options: PptxPreviewOptions): PptxPreviewer
}
