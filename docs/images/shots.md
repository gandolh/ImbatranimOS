# README images

How each image was made, so the next refresh is a re-run. Re-take an image when the screen it shows changes.

| File | Shows | How to reach that state | Viewport | Data | Taken |
|---|---|---|---|---|---|
| desktop.gif | Start opens wide → Terminal runs `whoami` and `ls`; File Manager and System Monitor open from their icons; each window is dragged into place | the beats below, one Playwright screenshot per beat, joined with ffmpeg | 1280×800 @1x, GIF 960 px wide, 12 fps, 14 s | demo files and recents below | 2026-11-16 |
| terminal.webp | Terminal after `whoami`, `pwd`, `ls`, `cat notes.txt`, `ps -o pid,user,comm` | Start → Terminal, move it to (200, 60), resize to about 700×316, type the commands, screenshot the `[data-app-id="terminal"]` element | 1440×900 @2x | demo files below | 2026-11-16 |
| files.webp | File Manager on Home with the preview pane on and `notes.txt` selected | Start → File Manager, resize to about 816×344, click the preview-pane button, click `notes.txt`, screenshot the window element | 1440×900 @2x | demo files below | 2026-11-16 |
| system-monitor.webp | System Monitor, Overview tab | Start → System Monitor, resize to about 622×617, wait 6 s for the graphs, screenshot the window, crop the empty bottom (`crop=iw:1036:0:0`) | 1440×900 @2x | live numbers | 2026-11-16 |
| marketplace.webp | Settings, Marketplace section: install from a URL, and the catalog down to Hollow | Start → Settings, resize to about 721×761, scroll the Marketplace heading to 16 px below the top of its scroll box, screenshot the window, keep the top 1352 px (`crop=iw:1352:0:0`) | 1440×900 @2x | the catalog in `marketplace/` | 2026-11-16 |
| phone-desktop.webp | The desktop on a phone: the icon grid and the phone taskbar | open the desktop, clear the notifications | Playwright `devices['iPhone 14']` (390×664 at 3×) | demo files below | 2026-11-16 |
| phone-start.webp | Start as a full-screen sheet: search, pins, recent files, the A to Z list | tap Start, blur the search field so it shows no focus ring | `devices['iPhone 14']` | demo files and recents below | 2026-11-16 |

All images are in the default theme and mode, **Apricot light**, with the sunset-hills wallpaper, time zone Europe/Bucharest. Keep that look when retaking them, or say in the README which theme an image shows. Screenshots were converted with `ffmpeg -i shot.png -c:v libwebp -quality 82 shot.webp`.

## Setup

Every image comes from a machine whose user is `imbatranim`, so the Terminal, Files and System Monitor show that user, its home folder and its processes, not the host's.

### In the dev container (the usual way)

1. `docker compose -f infrastructure/docker-compose.yml --profile dev up -d --build dev`. Without `watch` nothing syncs your edits, so the image must hold the code you are shooting; `--build` costs seconds when only the code or the version changed, because the dependencies reinstall only when a dependency changes. Wait for Vite on <http://localhost:5173>.
2. Make the demo files:

   ```bash
   docker compose -f infrastructure/docker-compose.yml --profile dev exec -T dev sh -c 'cd /home/imbatranim \
     && mkdir -p "Sample folder" Projects \
     && printf "Things to try:\n- open the Terminal\n- drag a window around\n- check System Monitor\n" > notes.txt \
     && printf "# Weekend plan\n\n- Water the plants\n- Finish the book\n" > "Sample folder/plan.md" \
     && printf "Hello from ImbatranimOS.\n" > "Sample folder/hello.txt" \
     && printf "print(\"hello\")\n" > Projects/hello.py'
   ```

3. Sign in with the dev container's owner from [infrastructure/README.md](../../infrastructure/README.md#the-dev-containers-sign-in). Never capture the sign-in form with the password typed.

### On the host (2026-11-16, and 2026-10-31 before it)

The 2026-11-16 images come from a host run, because the workspace had no Docker daemon. The backend ran as a Linux user named `imbatranim` with only the demo files in its home, which is what the dev container gives you:

- `npm ci`, then `npm run build -w apps/backend`, both with Node 24 (`.nvmrc`): the native modules must be built for the Node that runs them.
- The backend started from `apps/backend` with `node dist/main.js`, inside `unshare --mount --propagation private`. A small script, still root in that namespace, bind-mounted a copy of `/etc/passwd` and `/etc/group` with an `imbatranim` entry over the real ones, put a fresh tmpfs over `/home` with the repo bind-mounted back at its path, mounted a 32 GB tmpfs at `/home/imbatranim` and copied the demo files in, then dropped to that user with `setpriv --reuid --regid --init-groups`. That tmpfs is why System Monitor's disk row reads 16 KB of 32 GB. Environment: `HOME=/home/imbatranim`, `SHELL=/bin/sh`, `PORT=6160`, `FRONTEND_URL=http://localhost:6161`, `DB_PATH`, `NOTES_DIR` and `CONFIGS_DIR` outside the home, `MARKETPLACE_DIR` at the repo's `marketplace/`.
- The desktop: `VITE_API_URL=/api PORT=6160 npx vite --port 6161 --strictPort` in `apps/core`. Vite's proxy reads `PORT` to find the API.
- The first visit claimed the machine as `Developer`, with a random password from an environment variable, and saved the session with Playwright's `storageState`.

The shell is the host's `/bin/sh` (dash), so the prompt is `$ ` where the Alpine container shows `~ $ `, and `sudo` is left out of the Terminal shot because the host has one.

On 2026-10-31, `desktop.gif` and `marketplace.webp` were taken the same way without the namespace, by a host user named `imbatranim`.

### Either way

1. Open `notes.txt`, `Sample folder/plan.md` and `Projects/hello.py` once from File Manager, and close them, so Start has recent files.
2. Before each capture, close every window (the desktop restores open windows after a reload), open the notification panel, press Clear all, and blur the bell so it shows no focus ring.
3. Resize a window from about 6 px inside its bottom-right corner: the corner handle is easiest to grab there. Move a window by dragging its title bar from 160 px in.

## The GIF beats

With no windows open, at 1280×800:

1. Click Start, then the Terminal entry.
2. Focus `textarea[aria-label="Terminal input"]`, type `whoami` and Enter, then `ls` and Enter.
3. Drag the Terminal by its title bar so its top-left lands at about (340, 290).
4. Double-click the File Manager icon; drag it to about (590, 44).
5. Double-click the System Monitor icon; drag it to about (716, 252). Hold for two seconds.

Drag with `mouse move`, `mouse down`, a dozen small `mouse move` steps, `mouse up`. Keep the pointer away from the top edge of the screen: dropping a window there maximizes it.

Take one screenshot after each beat, two during each drag, and join them with an ffmpeg concat list that holds the last frame for 2.5 s, as in the readme-docs capture guide:

```bash
ffmpeg -y -f concat -safe 0 -i list.txt \
  -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 docs/images/desktop.gif
```

Every frame of the GIF (one per second, plus the first and last) and every still, full size and at 360 px wide, was checked for personal data before committing.
