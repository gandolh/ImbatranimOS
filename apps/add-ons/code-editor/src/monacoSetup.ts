/**
 * Self-host Monaco — NO CDN.
 *
 * The desktop runs behind a strict CSP (`script-src`/`connect-src` block
 * external hosts) and must work fully offline, so the default
 * `@monaco-editor/react` behaviour — fetching the Monaco AMD bundle from
 * jsDelivr at runtime — WOULD FAIL. Two things fix that, both here:
 *
 *  1. `loader.config({ monaco })` points `@monaco-editor/react` at the Monaco
 *     we bundled ourselves (`import * as monaco from 'monaco-editor'`), so it
 *     never touches the network loader at all.
 *
 *  2. Monaco's language services run in web workers. We wire them same-origin
 *     via Vite's `?worker` imports — each compiles to its own chunk served from
 *     our own origin — and hand them to Monaco through
 *     `self.MonacoEnvironment.getWorker`. No `workerMain.js` is ever fetched
 *     from a CDN.
 *
 * This module is imported once (for its side effects) before the editor first
 * renders. Because the whole code-editor add-on is lazily imported, all of this
 * — Monaco itself plus every worker chunk — lands in the editor's lazy chunk and
 * never inflates the eager desktop bundle.
 */
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

declare global {
  // Monaco reads this global to obtain its language-service workers.
  var MonacoEnvironment: monaco.Environment | undefined
}

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new JsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker()
      case 'typescript':
      case 'javascript':
        return new TsWorker()
      default:
        return new EditorWorker()
    }
  },
}

// Serve `@monaco-editor/react` the bundled Monaco instead of the CDN loader.
loader.config({ monaco })
