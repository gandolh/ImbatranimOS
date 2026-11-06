# Brief 46 — Open with offers the installed Linux apps

## Context

On 2026-11-06 the owner confirmed the "no" of
[research-native-apps-via-wayland.md](../../wiki/research-native-apps-via-wayland.md):
the OS's own apps and the office suite stay in the tab. The rule, in the
owner's words: "native apps only for the heavy lifting workloads, and keep
the simple work on the client side." The same day the owner asked for the
one build that research found worth doing: installed Linux apps as **Open
with** handlers, so Files can hand an `.odt` to LibreOffice or a `.dxf` to
QCAD when they're installed under Settings → Linux apps.

Today a Linux app can't be one. `execArgv` in
`apps/backend/src/modules/linux-apps/desktop-entry.ts` removes every field
code (`%f`, `%F`, `%u`, `%U`), because a Start entry passes no file; the
desktop entry's `MimeType` key isn't read; and
`POST /api/linux-apps/launchers/:id/launch` takes a session, no file. On the
tab side, Open with (`apps/add-ons/file-manager/src/components/OpenWithDialog.tsx`)
lists what `system.intents.associations` returns
(`packages/ui/src/system.ts`), built from the kit apps' declared types;
Start's Linux entries come from `apps/core/src/modules/linux-windows/launchers.tsx`
as `linux:<id>` app ids.

The suite opens docx, xlsx, xls, csv, pptx, pdf, dxf and dwg. It doesn't
open odt, ods, odp, doc, ppt or rtf: those are where LibreOffice adds
something.

## Owner decisions before building

**All answered 2026-11-06:** the owner took the default for each of the five.

1. **Where they show up.** **Decided:** in Open with, for the types their
   desktop entry's `MimeType` declares, **after the kit apps** and marked
   as Linux apps. A kit app that opens the type stays the default.
2. **As a default.** **Decided:** **never chosen automatically**, but "Always
   use this" may pick a Linux app, which is the owner's explicit choice
   (an `.odt` to LibreOffice, say). Settings → Default apps lists them the
   same way.
3. **A type no kit app opens** (odt, ods, odp, doc, ppt, rtf). **Decided:** a
   double-click opens Open with as it does today, with the claiming Linux
   apps first. Nothing opens without a choice.
4. **From a file name to its types.** **Decided:** the backend reads the
   shared-mime-info globs from the Nix profile the Linux apps are
   installed into, the same data their own desktops use. No hand-written
   table. With no globs file there, no Linux app is offered, and the
   backend log says why.
5. **On the phone.** **Decided:** offered there too, the same as Start offers
   them. Typing into one on Android waits on brief 45.

## What to do

1. `desktop-entry.ts`: read `MimeType`; `execArgv` takes an optional file
   and expands `%f` and `%F` to its path, `%u` and `%U` to its `file://`
   URL. With no file it removes them, as now, so Start doesn't change. An
   entry with none of the four codes takes no file and isn't offered.
2. The launch takes an optional path. The backend resolves it and refuses
   anything outside the user's home, symlinks included, with the same
   answer whether the file is missing or forbidden.
3. Matching a file name to the launchers that open it, through the globs
   (step 4 of the decisions). Where it runs, backend or tab, is the
   builder's choice; say why in the log entry.
4. The tab: `associations` adds the matching Linux launchers after the
   kit apps (`candidatesFor`, `allCandidates`, `openerName`), and opening
   with a `linux:<id>` launches it with the file instead of a window
   intent. Open with and Default apps mark them as Linux apps.
5. Tests: field codes with and without a file, an entry with no code, the
   path check (outside the home, `..`, a symlink out), the globs lookup,
   and `associations` with a Linux launcher. Then one walk in the dev
   container, which has LibreOffice installed: Files, an `.odt`, Open
   with, LibreOffice, and Writer opens that file. Start still opens
   LibreOffice with no file.
6. Corpus: the research page's table row for Files, the Linux apps pages,
   status and log.

## Acceptance

- The tests above pass; the full run stays green.
- The walk: Writer opens the `.odt` from Open with; "Always use this" for
  `.odt` sticks across a reload; a `.docx` still opens in Docs by default,
  with LibreOffice listed after it.
- A launch with a path outside the home is refused.
- **Owner check** after a deploy: the same walk on the VPS, with
  LibreOffice installed from Settings → Linux apps.
