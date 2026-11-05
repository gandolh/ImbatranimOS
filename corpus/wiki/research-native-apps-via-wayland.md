---
summary: Research (2026-11-06) on the owner's question whether the OS's own apps (the add-ons, Files, Settings, Terminal, imbatranim-office's Docs, Sheets, Slides, PDF and CAD, the marketplace apps) should become Linux apps streamed through the Wayland host like Firefox, or be swapped for native ones such as LibreOffice. Recommendation, for the owner to confirm, no. The 1 GiB cap holds one Firefox, the Android phone's on-screen keyboard can't type into a Linux window, every keystroke would cross the link, and locked calls (office 2026-10-21, Linux apps 2026-10-23, themes) stand against it. Native programs stay optional installs from Settings → Linux apps. Has server cost, user and code tables, and Nix closure sizes at the pin for LibreOffice, OnlyOffice, Gnumeric, zathura, Evince, qpdfview, QCAD and LibreCAD.
updated: 2026-11-06
---

# Research: the OS's own apps as Linux apps? (2026-11-06)

The owner asked on 2026-11-06: "Should we move the apps as native ones and serve
as firefox via wayland and smithay?" Read here as: should the OS's own apps
stop rendering in the tab as kit apps and add-ons, and instead run in the
container as [Linux apps](glossary-linux-apps.md) whose windows the Wayland
host streams to the tab, either as builds of our own or swapped for existing
programs such as LibreOffice? This page holds research only. Nothing was built.

**Recommendation: no**, for the OS's own apps and for the office suite. Linux
apps stay what they already are: programs the owner installs from Settings →
Linux apps when a mature native program does something no kit app does.
LibreOffice, QCAD and the others in §3 can be installed that way today, with no
OS change. The owner is asked to confirm in
[open-questions.md](open-questions.md).

## 1. What each costs the machine

Numbers are for one open app. Firefox is the only Linux app this repo has
measured. LibreOffice, QCAD and the rest have no memory or CPU figures here.

| | Kit app or add-on (in the tab) | Linux app (streamed) | Source |
|---|---|---|---|
| Server memory | Nothing per app. The container at rest is 388 MiB `memory.current`, 67 MiB anon | Firefox, one window: 506-593 MB PSS; 590 MiB anon idle in the container | [infrastructure/README.md](../../infrastructure/README.md) "the container cap"; [brief 04](../briefs/done/04-popups-and-firefox-in-a-window.md) |
| Server CPU, idle | 0 | Firefox 1.8-2.9% of a core, Wayland host 0.2% | brief 04 |
| Server CPU, busy | 0: the engine runs in the owner's browser | Scrolling: Firefox 22.4% + host 19.1% (WebP encoding). Video: 16.5% + 6.2% | brief 04 |
| Link, idle | 0 | 0 | brief 04 |
| Link, busy | File reads and saves | 160 kB/s scrolling; 239 kB/s for a flat synthetic 480 px video, lossless (a real film costs several times that; JPEG regions since brief 36, not re-measured); typing in foot ~1.2 KB/s; `yes` scrolling 2.25 MB/s at 27 frames/s | brief 04, [brief 02](../briefs/done/02-the-wayland-host-shows-a-window.md), [brief 36](../briefs/done/36-video-regions-go-lossy-and-text-stays-sharp.md) |
| One keystroke | Stays in the tab | Tab → `/api/wayland` → backend → control socket → host → the app draws → the host encodes (at most one frame per 33 ms, one in flight, acked under 512 KiB buffered) → back → `createImageBitmap`. At least one round trip on the link plus up to 33 ms. Not measured | [PROTOCOL.md](../../apps/wayland-host/PROTOCOL.md) "Flow control" |
| Second tab | Its own copy, in that browser | A second copy on the server: an app belongs to its tab's desktop session | [decisions-linux-apps.md](decisions-linux-apps.md) |
| Disk | The suite's one marketplace build | Nix volume: Firefox 1.4 GiB, LibreOffice 1.9-2.5 GiB more beside it (§3) | brief 01, §3 |

**The cap decides most of this.** On the VPS the container gets 1 GiB with
no swap and one CPU (the owner's call on 2026-11-04). Under the cap, the
container holds 621 MiB while Firefox plays a video. That leaves about 0.4 GiB
for everything else,
file cache included. The README sizes the cap for exactly that case: "1 GiB
holds one Firefox playing video with room to spare, and a second heavy one is
what the cap is for." At the cap the kernel kills Linux apps first
(`oom_score_adj` 1000). So a streamed office app open beside Firefox would be
killed first, and the document being edited in it would be lost with it. A
kit app's unsaved document lives in the owner's browser, outside the cap.
Encoding adds to the load: a busy window costs the Wayland host up to a fifth
of a laptop core, out of the cap's one CPU, and a VPS vCPU is likely slower
than that core.

How to measure the latency gap if wanted: time from a `key` message reaching
the backend to the first frame after it, on the dev container, then add a
phone link's round trip.

## 2. What it changes for the owner

| | Kit app | Linux app today | Source |
|---|---|---|---|
| Typing on Android (the main phone) | DOM inputs: the on-screen keyboard, autocorrect, IME | Doesn't work. The window is a canvas in a focusable `div` reading physical `KeyboardEvent.code`. There is no input element, so Android shows no on-screen keyboard | `apps/core/src/modules/linux-windows/LinuxWindowBody.tsx`, `keymap.ts` (inferred from the code on 2026-11-06, not tried on a phone) |
| IME, composed text | The browser's | None: the host offers no `zwp_text_input`. Layouts are US or Romanian only | brief 04 outcome; [brief 32](../briefs/done/32-a-keyboard-layout-for-linux-apps.md) |
| Phone link | Typing never waits on the link | Every key and pointer move makes a round trip (§1) | §1 |
| Dropped link | The open document keeps editing, and saves wait for the link | The window freezes and takes no input until the socket returns (30 s reload grace) | [decisions-linux-apps.md](decisions-linux-apps.md) |
| Offline | Neither works offline after a reload: core has no service worker (checked 2026-11-06), and files live on the server for both | same | |
| Clipboard | The browser's, rich content included | Plain text on the paste keys. X11 apps: open todo | [brief 41](../briefs/done/41-copy-and-paste-between-linux-apps-and-the-desktop.md) |
| HiDPI | Sharp | Soft above `devicePixelRatio` 1 (brief 33, open) | [status.md](status.md) |
| Sound | The browser's | Silent until brief 39 | status.md |
| Files | Real home, file dialogs with `startIn`, Open with, default apps | Same home, same user (Firefox's download showed in Files). It can't be an Open with handler: Start entries strip `%f`/`%u` and pass no file | `apps/backend/src/modules/linux-apps/desktop-entry.ts` |
| Windows | Zoom on open and close, the Win7 bar, unsaved-changes guards | OS windows with title bars that keep their places across a reload. Fade only while one is open. Some keys stay with the browser. Close asks the app | [decisions-linux-apps-built.md](decisions-linux-apps-built.md), brief 03 |
| Look | Apricot or Classic, light or dark, the radii, the UI font | The toolkit's own theme (Adwaita, Fusion) inside the frame | [decisions-themes.md](decisions-themes.md) |
| Accessibility | The floor in [ui-conventions.md](ui-conventions.md) §7: real DOM, labels, the focus ring | One canvas labelled "Linux app window". A screen reader reads nothing inside | `LinuxWindowBody.tsx` |
| Notifications | `system.notify` | Through the session bus. A click runs no action yet (todo) | [brief 42](../briefs/done/42-linux-apps-get-a-session-bus-and-notifications.md) |

## 3. What it changes for the code

- **Builds of our own would mean two UIs or pixels of a web page.** The apps
  are React components on the shared kit. A native build is either a second
  UI per app (GTK or Qt), or the web UI inside a browser on the server with its
  pixels streamed back. That second option is ruled out: "A web app that
  streams pixels is still off-soul" ([decisions-linux-apps.md](decisions-linux-apps.md),
  2026-10-23).
- **Swapping in existing programs reverses the suite.** imbatranim-office's
  five apps have replaced the built-ins since 2026-10-28. Both repos lock
  2026-10-21's calls: "editors call their engine on every keystroke and
  pointer move, so a network hop makes Word-style layout and CAD lag", "Still
  no OnlyOffice, Collabora or LibreOffice", and "an OS whose every app is web
  UI" ([decisions-office-suite.md](decisions-office-suite.md);
  imbatranim-office's `corpus/wiki/decisions.md`). A yes would revisit all three.
- **The `system` handle is for kit apps only.** `fs`, `http`, `window`,
  `intents`, `shortcuts`, `appearance`, `schedule`, `server` and `notify`
  (`packages/ui/src/system.ts`). A Linux app gets the real file system and
  D-Bus notifications. It gets no intents or Open with, no theme or mode, no
  file dialogs and no save guards.
- **The marketplace doesn't apply.** Linux apps come from Nix at the pin, not
  from the catalog. Updating them is brief 43, which is open.
- **Testing gets heavier.** Kit apps test in Vitest and any browser. A Linux
  app's behaviour needs the dev container with Nix, the Wayland host and the
  app installed, as the walks for briefs 02-06 did.
- **File formats.** The suite opens docx (Docs, SuperDoc), xlsx, xls and csv
  (Sheets, Univer 0.25.1 with ExcelJS), pptx (Slides, which patches the package
  in place), pdf, and dxf and dwg (CAD; DWG goes through LibreDWG as wasm on
  the suite's server). It doesn't open odt, ods, odp, doc, ppt or rtf
  (imbatranim-office's `os/descriptor.template.json`). Those are where
  LibreOffice would add something.

**Native options at the pin** (`nixos-26.05.13446.7dcdd87373d7`), x86_64, in MiB:

| OS app | Today | Native option | Download | Unpacked | More beside Firefox (download / unpacked) | Toolkit |
|---|---|---|---|---|---|---|
| Docs, Sheets, Slides | kit apps | LibreOffice 25.8.5.2, GTK 3 build | 858 | 2,679 | 597 / 1,869 | GTK 3 |
| | | LibreOffice 25.8.5.2, Qt 6 build | 1,023 | 3,377 | 734 / 2,477 | Qt 6 |
| | | OnlyOffice 9.1.0 | 725 | 2,053 | 528 / 1,456 | Qt 5 without qtwayland, so X11 through Xwayland, with a Chromium engine inside |
| Sheets | kit app | Gnumeric 1.12.60 | 184 | 561 | 19 / 56 | GTK 3 |
| PDF | kit app (pdf.js, @pdfcore/engine; it edits) | zathura 2026.05.20 | 183 | 526 | 73 / 142 | GTK 3 |
| | | Evince 48.4 | 407 | 1,180 | 132 / 309 | GTK 3/4 |
| | | qpdfview 0.5.0 | 170 | 533 | 71 / 200 | Qt 5 |
| CAD | kit app | QCAD 3.32.6.0 | 169 | 663 | 75 / 350 | Qt 5 |
| | | LibreCAD 2.2.1.5 | 333 | 1,138 | 166 / 613 | Qt 5 |
| (reference) | | Firefox 159.0 | 446 | 1,402 | | GTK 3 |

How these were measured: each closure's narinfo files from `cache.nixos.org`
were summed, starting from the snapshot's `store-paths.xz` on
`releases.nixos.org`, on 2026-11-06. The method reproduces brief 01's Firefox
install exactly (322 paths, 446 MiB, 1,402 MiB). These are sums, not installs.
`nixpkgs#libreoffice` builds one of the two LibreOffice variants, and which
one wasn't evaluated. Every closure above holds libwayland. QCAD, LibreCAD,
qpdfview and the Qt 6 LibreOffice carry qtwayland, and OnlyOffice doesn't.
The VPS's free disk isn't recorded in this repo, and the
first install also unpacks the 470 MB nixpkgs source until `nix store gc`.

## 4. A middle path, and what decides it

1. **Keep an app in the tab** if the owner types into it all the time, uses it
   on the phone, or it is part of the OS itself: Files, Settings, Notes,
   notifications, Open with. Every app the OS has today meets at least one of
   these. The Terminal already shows the middle way: a real PTY and a real
   shell, carried to the tab as data, which is the "data, never pixels" rule
   ([os-layering.md](os-layering.md)) that Linux apps are the only exception
   to.
2. **Install a Linux app** when a mature native program does what no kit app
   does and isn't worth building: LibreOffice for ODF and the old binary
   formats, QCAD or LibreCAD for full 2D drafting, GIMP, Inkscape. It should
   be used now and then, from a computer with a keyboard, and on the VPS one
   at a time. The owner installs it beside the kit apps, never in place of
   them.
3. **Do file work on the server as a one-off job**, not in a streamed window.
   That is how CAD already opens DWG: LibreDWG as wasm in Node, 0.4-0.85 s per
   file and 260-320 MB while it runs (imbatranim-office's `decisions.md`).

| App | Verdict | Why |
|---|---|---|
| Files, Settings, Terminal, Notes and the other add-ons | Stay | Part of the OS, or typed into. The Terminal already runs natively, as data |
| Docs, Sheets, Slides | Stay. LibreOffice as an optional install | Typing, the phone, the 2026-10-21 calls. LibreOffice opens formats the suite doesn't |
| PDF | Stay | The kit app already edits. zathura is the cheapest viewer if one is wanted |
| CAD | Stay. QCAD or LibreCAD as an optional install | Driven by the pointer. DWG is already handled on the server |
| Marketplace kit and URL apps | Stay | They are web apps, and streaming a web app's pixels is off-soul |

The optional installs would feel more at home with four things that don't
exist yet. They are not proposed as briefs: Open with for a Linux app
(`desktop-entry.ts` strips the field codes), sound (brief 39), HiDPI (brief
33), and typing on Android (an input element and a text-input protocol).

## 5. Recommendation

**No.** The OS's own apps and the suite stay kit apps and add-ons. A Linux app
stays an optional install from Settings → Linux apps. The three strongest
reasons:

1. **The VPS can't carry it.** The 1 GiB cap holds one Firefox. A streamed
   editor beside it is the first process the kernel kills, along with the
   unsaved document, and each window adds encoding CPU. Kit apps cost the
   server nothing.
2. **The phone loses.** On Android, the on-screen keyboard can't type into a
   Linux window today (inferred from the code, not tried on a phone), and every keystroke would make a round trip over a mobile link.
   Linux windows are also soft on the phone's HiDPI screen and silent.
3. **The repo's own locked calls stand against it.** The office decision of
   2026-10-21 (a network hop makes editors lag; no LibreOffice; every app is
   web UI), the Linux apps decision of 2026-10-23 (a web app's pixels are
   off-soul), the two themes, and the accessibility floor.

If the owner wants installed native programs to fit better, the first thing
to build is Open with for a Linux app, so that Files can hand an `.odt` to
LibreOffice. That would get a brief when asked.
