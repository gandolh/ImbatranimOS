/**
 * Does this document contain a fenced code block worth loading the highlighter for?
 *
 * Its own module, apart from `highlight.ts`: the preview asks it on every render, and a
 * value imported from `highlight.ts` put that module (rehype-highlight and its grammars,
 * 156 KiB) in Notepad's chunk, so its dynamic import loaded nothing that wasn't already there.
 */
export function hasFencedCode(text: string): boolean {
  return /^ {0,3}(```|~~~)/m.test(text);
}
