# imbatranimOS: the controller's rulings on the critique (2026-11-13)

They override the critic (`imbatranimOS.md`) where they differ. Everything else in the critique stands.

1. **The phone desktop:** an 88 px icon stride under 600 px, rows counted from the measured height, and the desktop scrolls vertically past that; no label under the taskbar at 390 or 360.
2. **App icons (a technical call, not an owner question):** the built OS keeps the icons it shows today (the Linux apps' own icons, the web apps' own glyphs). On the board, each app gets its own distinct stand-in glyph (no two apps share one); a Note sticky says these are stand-ins and the build keeps today's icons. Re-tag the sticky that calls "never brand art" a ruling: it is the direction file's note.
3. **Settings cards:** the edge drawn in an `::after` overlay so it sits over the preview, and the chosen card gets a 2 px accent ring as well as the check. Same rule in the board's `.dc.html` files.
4. **The phone foot band:** take the critic's fix (`Signed in` at 12/16 beside the tile, buttons sized to their content), measured at 360 with nothing cut.
5. **Dark:** the accent swatches show the pastel in both modes; every floating layer's body (Start, Settings, windows) uses `container-low` in dark, so a window is lighter than the wall, never a hole. Update the tokens and the map; re-run contrast.
6. **Gate 56:** set the sticky letter heads to `top:0` and record a waiver with its reason (a false positive here).
7. **Start's height:** cap it at the viewport height minus the taskbar and a margin, so it fits a 1366x768 laptop; the A-Z pane scrolls inside.
8. **The twin's fixed `.os` height** that breaks the 768 and 1024 renders: make it fill the viewport.
9. Re-run every Floor check from scratch, and report the first-screen checks at 1280x800, 1366x768, 390x844 and 360x800.
