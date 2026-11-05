---
summary: Research (2026-11-06) on the owner's idea of sending a Linux app's UI to the tab as a description the React desktop renders, instead of as pixels. Wayland carries finished buffers, so a description has to come from above it — the toolkit (GTK Broadway, Qt WebGL streaming), the app's accessibility tree (AT-SPI, Newton), the app compiled to WebAssembly (Qt, LibreOffice/ZetaOffice, egui, Greenfield), or a framework the app is written for (LiveView, Blazor Server, Shopify's remote-dom). Each option is compared on the phone keyboard, HiDPI, themes, accessibility, where input is handled, bandwidth, server memory and the apps it covers. Verdict: none is worth a prototype now. Broadway is deprecated and sends text as images, Qt's streaming plugin died with Qt 5, an accessibility tree can't draw documents or web pages, and WASM builds are canvases the 2026-10-21 office call rejected. The owner's real wants are cheaper to get inside today's pipeline: text-input-v3 for the phone keyboard (brief 45, drafted), brief 33 for HiDPI, and the Settings portal for colour scheme and accent.
updated: 2026-11-06
---

# Research: a UI description instead of pixels? (2026-11-06)

The owner asked on 2026-11-06 about "using the react as frontend and the window
composer sending somehow with webassembly the ui that needs to be rendering.
Maybe something like going from wayland through the api to the ui that knows
how to renders the things". Read here as: could a Linux app reach the tab as a
description of its UI that the React desktop draws, and so take the phone's
keyboard, stay sharp on HiDPI, wear the themes and cost the server less? Those
are the costs [research-native-apps-via-wayland.md](research-native-apps-via-wayland.md)
names. Research only; nothing was built. **Verdict: no remote-UI prototype
now.** The one worth doing goes after the goal, not the mechanism: the phone
keyboard through text-input-v3 ([brief 45](../briefs/todo/45-the-phones-keyboard-types-into-a-linux-app.md), drafted, not filed).

## 1. The constraint: Wayland carries pixels, nothing above them

A Wayland client draws its own window and hands over a finished buffer. The
host takes `wl_shm` buffers only (`session.rs`), composes subsurfaces and sends
damaged rectangles as deflate RGBA, lossless WebP, or JPEG for video regions:
one frame per toplevel per 33 ms at most, one in flight, acked under 512 KiB,
through the backend to `/api/wayland`, drawn with `createImageBitmap`
([PROTOCOL.md](../../apps/wayland-host/PROTOCOL.md)). Input returns as JSON:
pointer events in surface coordinates and evdev key codes from a focusable
`div` over the canvas, which the host's xkb state turns into `wl_keyboard`
events. Every key is a round trip.

Above the buffers the host learns a window's title, `app_id`, geometry,
popups, cursor name and copied text. **text-input-v3**, stubbed in `stubs.rs`,
carries more: that a text field has focus, its purpose (email, number,
password…), up to 4000 bytes around the cursor and the cursor's rectangle, and
it takes composed and committed text back
([protocol](https://wayland.app/protocols/text-input-unstable-v3)). No Wayland
protocol carries a widget tree: Newton's draft (§3) was never merged, and
wayland-protocols' `staging/` has no accessibility protocol (checked 2026-11-06).

So a description must come from above Wayland: (a) the toolkit, (b) the app's
accessibility tree, (c) the app running in the tab, or (d) a framework the app
is written for. "From wayland through the api" fits (b) best. The Terminal is
(d) in small: xterm.js draws the PTY's bytes, so TUIs already arrive as data.

## 2. The options side by side

| Option | Phone keyboard, IME | HiDPI | OS themes | Accessibility | Input handled |
|---|---|---|---|---|---|
| Today: pixels | None (canvas, no input element) | Soft above ratio 1 ([brief 33](../briefs/todo/33-linux-windows-are-sharp-on-hidpi-screens.md)) | Toolkit's own | One canvas | Server, every key a round trip |
| GTK 4 Broadway | Hidden input on iOS and Android Chrome only, no IME | Integer scale; text and icons are images | GTK's own, drawn as CSS | None (divs and images) | Server, round trip |
| Accessibility tree as React widgets | Yes, real inputs | Sharp (DOM) | Yes, the kit's | Yes, as far as the app exposes it | Echo local, app reacts after a round trip |
| App as WASM in the tab | Qt 6: hidden input with composition; egui "doesn't always work"; LibreOffice WASM (Qt 5.15): none | Yes | Toolkit's own, in a canvas | Qt: basic, off by default; egui: experimental | In the tab |
| LiveView, Blazor Server | Yes (DOM) | Sharp | The app's CSS | DOM | Echo local, events round trip |
| remote-dom (sandboxed JS) | Yes (host's DOM) | Sharp | Yes, if mapped to kit components | DOM | In the tab, one `postMessage` hop |

| Option | Link | Server memory per app | Runs unchanged | Status, licence | Fit with the host and desktop |
|---|---|---|---|---|---|
| Today: pixels | Firefox scrolling 160 kB/s | Firefox 506-593 MB PSS | Any Wayland or X11 app | Built | — |
| GTK 4 Broadway | Node diffs plus PNG textures; text is "the main cost" (Larsson) | The app, no encoder | GTK 3 and 4 apps only | Deprecated in GTK 4.18, removal in GTK 5; LGPL | A second display path beside the host |
| Accessibility tree | "An order of magnitude lower" than RDP (Sinter) | The app plus the a11y bus | Apps with good trees; not their content | Research prototypes only | at-spi2 in the image, a large D-Bus client, a renderer |
| App as WASM | One download (LibreOffice: 53 MB brotli), then file bytes | None; memory moves to the phone | None: every app is a port | Qt: supported; ZetaOffice: open beta | No host; a file bridge and cross-origin isolation |
| LiveView, Blazor Server | Diffs | State per session (Blazor ~250 KB minimal) | None: written for it | Mature | Kit apps with a server already cover it |
| remote-dom | None (in the tab) | None | None: written for it | MIT, maintained | URL apps only (§5) |

## 3. Toolkit and semantic remoting

**GTK 4 Broadway.** `gtk4-broadwayd :N` serves its own page and WebSocket,
and apps run with `GDK_BACKEND=broadway` ([docs](https://docs.gtk.org/gtk4/broadway.html):
"written as an experiment and is not the most actively developed backend").
GTK 3's Broadway streamed image diffs, today's class. GTK 4's turns render
nodes into DOM boxes with CSS ([Larsson, 2019](https://blogs.gnome.org/alexl/2019/03/29/broadway-adventures-in-gtk4/)),
but only colours, borders, shadows, linear gradients, opacity, clips,
transforms and containers. Text, icons, blur, masks and Cairo drawing become
server-drawn PNG textures at `Math.round(devicePixelRatio)`
(`gsk/broadway/gskbroadwayrenderer.c`). Every glyph is still an image, and a
document or canvas is one big one: LibreOffice's GTK build would send pictures
of its pages (inferred). Firefox, the one Linux app in use, isn't a Broadway
client. `broadway.js` (91 KB) focuses an off-screen `<input>` on iOS and
Android Chrome when GTK asks for the keyboard, filling it with 80 spaces on
Android ("TODO: Should be exchange with broadway server"); no IME, no ARIA.
The backend was deprecated in GTK 4.17.4 (2025-02-01: "a clear signal that we
intend to remove them in the GTK 5",
[blog.gtk.org](https://blog.gtk.org/2025/02/01/whats-new-in-gtk-winter-2025-edition/)),
its renderer in 4.19.3. Upkeep goes on (a rework on 2026-09-08, GTK 4.24.1 on
2026-10-01), and Nix's `gtk4` still ships `gtk4-broadwayd`. Fitting it in
means a daemon per session (it can listen on a Unix socket, proxied behind the
sign-in) and splitting a page that is its own window manager into OS windows.

**Qt WebGL streaming** (Qt 5.10-5.15, [merged 2017](https://www.qt.io/blog/2017/07/07/qt-webgl-streaming-merged))
sent OpenGL calls to the browser. Qt 6 never got it: the port is an open
request ([QTBUG-95550](https://bugreports.qt.io/browse/QTBUG-95550)) and a
community patch asked "Is there any chance to get the QtWebGLPlugin into Qt 6?"
([2022](https://lists.qt-project.org/pipermail/development/2022-June/042712.html)).
**Xpra's HTML5 client** (MPL-2.0, v20 2026-03-18; GPL-2.0 server whose master
has a `wayland/` backend in work) sends pixels and video like today, and was
rejected on 2026-10-23 ([decisions-linux-apps.md](decisions-linux-apps.md)).
Other "UI tree over the wire" projects need apps written for them:
[Remote Flutter Widgets](https://pub.dev/packages/rfw) (2.0.0, 2026-10-21)
and [Textual Web](https://github.com/Textualize/textual-web) (beta, a terminal).

**The accessibility tree.** AT-SPI exposes each app's widgets on a D-Bus bus.
The best prior art, [Sinter](https://www.cs.unc.edu/~porter/pubs/sinter16.pdf)
(EuroSys 2016), turned Windows and macOS trees into XML that proxies, one a
browser client, rebuilt as native widgets, at "an order of magnitude lower"
bandwidth than RDP. It mapped 115 of Windows' 143 roles and 45 of macOS's 54.
Its limits are this option's: "If the element does not export accessibility
information, no screen reader can read it"; visual apps (PowerPoint) are the
long tail; its Word needed work "to be usable by user without a visual
impairment". Nothing maintained renders a remote app from its tree for sighted
use (searched 2026-11-06). **Newton** is the owner's idea at Wayland's level
([2024-06-18](https://blogs.gnome.org/a11y/2024/06/18/update-on-newton-the-wayland-native-accessibility-project/)):
GTK pushes [AccessKit](https://github.com/AccessKit/accesskit) trees as JSON
through a draft protocol, "part of the surface's committed state", and actions
(focus, click, caret, slider) come back. It stayed a prototype when the
contract ended, with large documents (GtkTextView pushed its whole content), no
coordinates and one tree per surface open. GTK 4.18 merged AccessKit, but Linux
is "still defaulting to at-spi"
([2025-06-27](https://discourse.gnome.org/t/an-accessibility-update/29588)),
and AccessKit's web adapter is only "planned". A tree describes a form well
and a document, canvas, video or web page hardly at all, which is what Linux
apps are installed for here.

## 4. The app in the tab as WebAssembly

Nothing runs unchanged: each app is a port, the server keeps only files, and
the phone pays the memory.

- **Qt for WebAssembly** ([Qt 6.10](https://doc.qt.io/qt-6.10/wasm.html)) is a
  supported platform drawing in a canvas, WebGL required. Threads need COOP
  and COEP headers, which the OS doesn't send (checked). No system fonts or
  native styles; `QDialog::exec` needs Asyncify or JSPI; screen-reader
  "shadow" elements are "disabled by default". `qwasminputcontext.cpp` uses a
  hidden input with composition events, so the phone keyboard works.
- **LibreOffice** builds for WASM with a patched Qt 5.15.2; "The build
  generates a Writer-only LO build", and linking "possibly needs 64GB RAM"
  ([README.wasm.md](https://git.libreoffice.org/core/+/refs/heads/master/static/README.wasm.md)).
  allotropia's ZetaOffice ships Writer, Calc and Impress from it in "open
  beta", mobile "coming soon" ([zetaoffice.net](https://zetaoffice.net)); its CDN
  serves 36.3 MB of wasm, 15.9 MB of data and 0.9 MB of JS, brotli, dated
  2025-05-13 (HEAD requests, 2026-11-06). Documents sit in Emscripten's memory
  file system, scripted over UNO by [zetajs](https://github.com/allotropia/zetajs)
  (MIT, v1.2.0), so the backend would stream files in and back. Qt 5.15 had no
  phone keyboard. Against it stand 2026-10-21's "Still no OnlyOffice, Collabora
  or LibreOffice" and "a canvas in a frame neither looks nor behaves like one"
  ([decisions-office-suite.md](decisions-office-suite.md)).
- **GTK** has no WASM port (no Emscripten entry in GLib's or GTK's NEWS);
  Greenfield's SDK has its GTK 4 build commented out; the one fork is personal.
- **egui, iced, Slint** are for new apps, in a canvas. eframe's README: the
  on-screen keyboard "doesn't always work", and it suits apps "where performance
  and responsiveness are more important than accessibility and mobile text
  editing". A new app here is a kit app, which is real DOM.
- **[Greenfield](https://github.com/udevbe/greenfield)** (AGPL-3.0), a
  compositor in the browser, runs clients rebuilt with its Emscripten SDK ("a
  web POSIX compatibility layer, but is not Linux compatibility layer") and
  remote ones as GStreamer H.264. Last code commit 2024-09; rejected 2026-10-23.

## 5. Framework-level server UI

[LiveView](https://phoenix-live-view.hexdocs.pm/welcome.html) and [Blazor Server](https://learn.microsoft.com/en-us/aspnet/core/blazor/host-and-deploy/server)
keep a process or circuit per session and send DOM diffs; inputs are real DOM. They cover only
apps written in them, and the OS's answer to that shape is a kit app with its own server
(`system.server`), which carries data, not UI. **[remote-dom](https://github.com/Shopify/remote-dom)**
(MIT, `@remote-dom/core` 1.12.1 on 2026-10-30; remote-ui lives in the same repo) mirrors a DOM tree
built in a sandboxed iframe or worker into the host page through an allowlist of custom elements.
That fits **URL apps**: their code stays in the opaque frame while the desktop draws kit components,
with the themes and accessibility. It changes 2026-10-07's frame model ([decisions-marketplace.md](decisions-marketplace.md)),
an app drawing kit widgets can mimic an OS dialog, and it does nothing for Linux apps.

## 6. Verdict, and what is cheaper

| Option | Verdict |
|---|---|
| GTK 4 Broadway | No. GTK apps only, Firefox excluded; text still images; slated for removal in GTK 5 |
| Qt WebGL streaming, Xpra | No. Dead with Qt 5; Xpra is pixels |
| Accessibility tree (AT-SPI, Newton) | No. Can't draw content; Newton unmerged |
| LibreOffice or Qt as WASM | Not now. 53 MB canvas in beta, against the 2026-10-21 calls. Revisit only if those calls are |
| LiveView, Blazor Server | No. Kit apps already do it |
| remote-dom for URL apps | Possible later, as its own question about URL apps |

The owner's wants are cheaper inside today's pipeline, through protocols the
apps already speak:

1. **The phone keyboard: text-input-v3.** GTK 3 (`imwayland.c`), GTK 4
   (`gtkimcontextwayland.c`) and Qt 6.8 (`qwaylandtextinputv3.cpp`) speak it;
   Firefox types through GTK's input method (to confirm). The host forwards
   the field's state; the tab focuses a hidden input at the cursor rectangle,
   `inputmode` from the purpose, mirrors the surrounding text for backspace and
   autocorrect, and sends composed text back. smithay 0.7's `text_input`
   relays to an input-method-v2 client, so the host needs an input method of
   its own or its own handler. [Brief 45](../briefs/todo/45-the-phones-keyboard-types-into-a-linux-app.md)
   proves that a tap in a Linux text field raises Android's keyboard after the
   round trip, and that autocorrect and swipe typing land in the app.
2. **HiDPI: [brief 33](../briefs/todo/33-linux-windows-are-sharp-on-hidpi-screens.md)**, open.
3. **Themes, partly: the Settings portal.** `org.freedesktop.appearance` has
   `color-scheme`, `accent-color` and `contrast`
   ([spec](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html));
   libadwaita reads the first two (`adw-settings-impl-portal.c`). The backend
   already answers D-Bus on each session bus
   ([decisions-linux-apps-built.md](decisions-linux-apps-built.md)), so mode
   and accent could follow Apricot and Classic; radii and fonts can't. Not briefed.

What would change the verdict: Newton or an equivalent merged, with an
AccessKit web adapter; ZetaOffice out of beta with the phone keyboard, plus a
revisit of the office calls; or the owner wanting URL apps to look native.
