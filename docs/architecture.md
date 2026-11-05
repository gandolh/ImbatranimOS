# Architecture

One Docker container is the computer and the browser is its screen. Inside the container, a NestJS server (`apps/backend`) serves the built React desktop and the API on one port. The desktop (`apps/core`) draws the windows, the Start menu and the taskbar. Each app is its own package under `apps/add-ons/`, and talks to the machine through a `system` handle the desktop gives it. The server sends data (shell bytes, file listings, numbers from `/proc`), never pixels.

```mermaid
flowchart LR
  subgraph tab["Browser tab"]
    desktop["Desktop<br/>apps/core"]
    addons["Apps<br/>apps/add-ons/*"]
    addons -- system handle --> desktop
  end
  subgraph box["Docker container: Alpine, user imbatranim"]
    nest["NestJS server<br/>apps/backend, port 8080"]
    pty["Shell<br/>node-pty"]
    proc["procfs<br/>CPU, memory, processes"]
    home[("home folder<br/>Docker volume + SQLite")]
    proxy["Browser proxy origin<br/>port 8081"]
    nest --> pty
    nest --> proc
    nest --> home
  end
  desktop -- "REST + WebSockets, session cookie" --> nest
  addons -. "Browser app's frame" .-> proxy
```

## Opening the Terminal, step by step

1. You open the machine's address. NestJS serves the desktop's static files.
2. The desktop asks `GET /api/identity` who is signed in. With no session it shows the setup or sign-in screen; signing in sets the `imb_session` cookie.
3. Start → Terminal. The desktop opens a window and mounts the Terminal app, handing it the `system` handle.
4. The app opens a WebSocket to `/api/pty`. The server checks the session on the upgrade and starts a shell with node-pty, as the `imbatranim` user.
5. Keystrokes go up the socket and the shell's output comes back; xterm.js draws it.
6. Files and System Monitor work the same way over REST (`/api/files`, `/api/system`), and every API route needs the session except `GET /api/identity`, setup, sign-in, sign-out and the health check.

### Linux apps started from the Terminal

A Linux app you start in the Terminal shows its windows in the tab whose
Terminal started it. One running in the foreground (`foot`, without `&`)
ends with its shell, when you close the Terminal window, close the tab or
reload it, as on any Linux desktop when a terminal closes (a program that
ignores the hang-up, as foot does, keeps running). The Terminal's
shell (BusyBox `sh`) does not stop its background jobs when it ends, so an
app started with `&`, like one started with `setsid` or `nohup`, keeps
running as long as the tab's desktop session: a reload finds it again within
about 30 seconds, and closing the tab ends it 30 seconds later. An app
started from Start lives that long too. While the cover screen is up, the
tab's Linux apps are paused, and they carry on when you uncover the desktop.

### Copy and paste with Linux apps

Plain text copies both ways between Linux apps, the rest of the OS and the
computer the browser runs on. Copy in a Linux app as usual and the text is on
the clipboard. To paste into a Linux app, use Ctrl+V, Ctrl+Shift+V or
Shift+Insert: the desktop reads the clipboard first, so the browser asks for
permission (Chrome once for the site, Firefox on every paste). If you refuse,
the app pastes whatever it had copied itself. Images and files don't cross,
and neither does text over 1 MiB.

### Notifications and the session bus

Each tab's Linux apps share a D-Bus session bus of their own, started with
the tab's desktop session and stopped with it. Through it Firefox keeps one
instance (New Window opens a window of the running Firefox), apps open links
in the running browser, and an app's notification, a website's in Firefox
included, shows as an ordinary OS notification titled with the app's name.
Clearing it in the notification centre tells the app. Clicking it does
nothing yet.

## No root, by design

Everything inside the container, the shell you get in Terminal and the process that serves the desktop, runs as `imbatranim`, an unprivileged user created in the image. There is no sudo, and the container is not meant to run as root or privileged. Features that would need root are on the project's rejection list ([corpus/wiki/real-os-gaps.md](../corpus/wiki/real-os-gaps.md)).

## Apps from outside the repo

Settings → Marketplace installs more apps. An app described in [`marketplace/`](../marketplace/README.md) is cloned at a pinned commit, built inside the container and runs in the desktop's own page, so only reviewed code gets there. An app installed from any other GitHub URL must be prebuilt, and runs in a sandboxed frame whose only capability is `notify`.

## Going deeper

- [adding-an-app.md](adding-an-app.md): the add-on contract, with the steps to add one
- [corpus/wiki/architecture.md](../corpus/wiki/architecture.md): the stack, layer by layer
- [corpus/wiki/os-layering.md](../corpus/wiki/os-layering.md): the three layers and the `system` handle
- [infrastructure/README.md](../infrastructure/README.md): HTTPS, the sign-in and the Browser's second port
- The docs site's [architecture page](../apps/docs/docs/architecture.mdx) and [tour of the desktop](../apps/docs/docs/tour.mdx), plus an API reference generated from the code by `npm run docs` ([apps/docs](../apps/docs/README.md))
