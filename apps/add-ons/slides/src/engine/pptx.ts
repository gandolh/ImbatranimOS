/**
 * Lazy bridge to the pptx renderer. `pptx-preview` (it drags in jszip, lodash,
 * echarts) is heavy and must never land in the desktop boot bundle — it is
 * pulled in on first open via dynamic import, so the whole engine becomes its
 * own chunk. Nothing here is imported at module top level.
 *
 * Best-effort by nature: pptx-preview reconstructs slides from OpenXML in the
 * browser and does not match PowerPoint fidelity. The Slides app pairs it with
 * a visible hint and a Download escape hatch.
 */

/**
 * Render every slide of `data` into `container`, stacked vertically (the host
 * scrolls). Each slide is drawn at `width`×`height` px. Any previous render in
 * the container is cleared first.
 */
export async function renderPptx(
  container: HTMLElement,
  data: ArrayBuffer,
  size: { width: number; height: number }
): Promise<void> {
  const { init } = await import('pptx-preview')
  container.innerHTML = ''
  const previewer = init(container, { width: size.width, height: size.height })
  await previewer.preview(data)
}
