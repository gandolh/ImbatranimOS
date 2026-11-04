# README images

How each image was made, so the next refresh is a re-run. Re-take an image when the screen it shows changes.

| File | Shows | How to reach that state | Viewport | Data | Taken |
|---|---|---|---|---|---|
| desktop.gif | Start → Terminal runs `whoami` and `ls`; File Manager and System Monitor open; each window is dragged into place | the beats below, one Playwright screenshot per beat, joined with ffmpeg | 1280×800 @1x, GIF 960 px wide, 12 fps, 14 s | demo files below | 2026-11-03 |
| terminal.webp | Terminal after `whoami`, `grep PRETTY_NAME /etc/os-release`, `ls`, `sudo -v`, `ps -o pid,user,comm` | double-click the Terminal icon, type the commands, screenshot the `[data-app-id="terminal"]` element | 1440×900 @2x, window 700×460 | demo files below | 2026-11-03 |
| files.webp | File Manager on Home with the preview pane on and `notes.txt` selected | double-click File Manager, drag its bottom-right corner to about 816×524, click the preview-pane button, click `notes.txt`, screenshot the window element | 1440×900 @2x | demo files below | 2026-11-03 |
| system-monitor.webp | System Monitor, Overview tab | double-click System Monitor, resize to about 622×617, screenshot the window, crop the empty bottom (`crop=iw:1016:0:0`) | 1440×900 @2x | live numbers | 2026-11-03 |
| marketplace.webp | Settings, Marketplace section: install from a URL, and the catalog: Hollow and Office with its five apps | Start → Settings, resize to about 721×761, scroll the Marketplace heading to just below the top, screenshot the window, keep the top 1046 px (`crop=iw:1046:0:0`) | 1440×900 @2x | the catalog in `marketplace/` | 2026-11-03 |

## Setup

All five images were retaken on 2026-11-03 from the rebuilt dev container, in the default theme
and mode, **Apricot light**, with the sunset-hills wallpaper. A machine whose saved appearance
predates the themes moves to Apricot light on its first sign-in, so the dev volume needed nothing.
Keep that look when retaking them, or say in the README which theme an image shows.

Resize a window from about 6 px inside its bottom-right corner: the corner handle is easiest to
grab there. Moving the window and every other step is as below.

The images of 2026-10-09 come from the dev container. On 2026-10-31 `desktop.gif` and `marketplace.webp` were taken again from a host run, because the workspace could not pull the Node base image: the backend built with `npm run build -w apps/backend` and started with `node dist/main` as a Linux user named `imbatranim` with the demo files in its home and the database outside it, and the desktop from `VITE_API_URL=/api npm run dev -w apps/core`. Either way the windows show the same user and files.

All images come from a machine whose user is `imbatranim`, so the Terminal, Files and System Monitor show the container's own user, home folder and processes, not the host's.

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
4. Close every window before a capture. The desktop restores open windows after a reload.
5. After `agent-browser set viewport`, reload: the desktop icons overlap until the page lays them out again.

## The GIF beats

With no windows open, at 1280×800:

1. Click Start, then the Terminal entry.
2. Focus `textarea[aria-label="Terminal input"]`, type `whoami` and Enter, then `ls` and Enter.
3. Drag the Terminal by its title bar so its top-left lands at about (340, 290).
4. Double-click the File Manager icon; drag it to about (590, 44).
5. Double-click the System Monitor icon; drag it to about (716, 252). Hold for two seconds.

Drag with `mouse move`, `mouse down`, a dozen small `mouse move` steps, `mouse up`. Keep the pointer away from the top edge of the screen: dropping a window there maximizes it.

Take one screenshot after each beat, two during each drag, and join them with an ffmpeg concat list that holds the last frame for 2.5 s, as in the readme-docs capture guide. The 2026-10-09 GIF was recorded with `agent-browser --session imbatranim record start <abs path>.webm` instead, then trimmed and converted:

```bash
ffmpeg -y -ss 7.6 -i hero.webm \
  -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 docs/images/desktop.gif
```

Screenshots were converted with `ffmpeg -i shot.png -c:v libwebp -quality 82 shot.webp`. Every frame of the GIF (one per second, plus the first and last) was checked for personal data before committing.
