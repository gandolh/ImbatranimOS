# Task 03 — Identity & theming: black/white retro-simple + accent system

## Context

The visual identity (corpus/wiki/decisions.md): classy black & white,
simple retro style, with ACCENT COLORS parameterized — the final accent is
chosen from rendered mockups inside this brief, not before. Skeleton =
forked Fluent family (vinceliuice's Fluent GTK + Kvantum port + icons),
recolored monochrome. Modern flat rendering on the Win7-classic layout —
explicitly NOT Aero glass, no compositor blur. Depends on briefs 01/02.

## Files you OWN

- `assets/theme/` (forked+recolored Kvantum theme, GTK3/GTK4 theme, named
  "Imbatranim")
- `assets/icons/` (forked icon theme + ~20 hand-made surface icons: logo,
  start button, default pins)
- `assets/wallpapers/` (at least 1 default + 2 alternates, B&W-with-accent
  aesthetic)
- `assets/plymouth/imbatranim/` (boot splash: logo on black)
- `assets/sddm/imbatranim/` (QML login theme: minimal B&W, accent on
  focus)
- `config/rootfs/etc/os-release`, `config/rootfs/etc/lsb-release` overlay
  (NAME="ImbatranimOS", VERSION="1.0"), GRUB menu title
- `steps/40-branding.sh` (installs all of the above, sets defaults)

## Files you must NOT touch

- Panel layout / keybindings (brief 02 owns behavior; you own colors/art)
- `build.c` (brief 01)

## What to do

1. Fork Fluent GTK + Kvantum themes; strip to a monochrome palette
   (near-black surfaces, off-white text or inverse for light variant) with
   ONE accent variable applied to selection/focus/progress/toggles. Keep
   both light and dark variants; pick the shipped default.
2. Generate 3-4 accent candidate builds (e.g. crimson, cobalt, emerald,
   signal-orange on B&W), screenshot the same desktop in each, present
   mockups for the accent decision — record the pick in
   corpus/wiki/decisions.md.
3. Icon theme: fork Fluent icons, desaturate folder/system icons toward
   the B&W language; hand-make the ~20 surface icons (OS logo/start
   button first — it's on every screenshot).
4. Plymouth: minimal logo-on-black with a subtle progress element; SDDM
   QML theme to match (this is the QML warm-up for the Welcome app).
5. os-release/lsb/GRUB branding so the OS names itself ImbatranimOS
   everywhere (menu, neofetch/fastfetch, installer).

## Acceptance

Boot → GRUB says ImbatranimOS → branded Plymouth → branded SDDM → desktop
fully B&W+accent themed (Qt via Kvantum AND a GTK app like Firefox look
coherent), branded wallpaper, no stock-LXQt/Ubuntu visual leftovers in the
default session. Accent decision recorded in decisions.md.
