# Task 14 — Reskin: Windows-7-classic layout, B&W + accent identity

## Context

Carried-over identity (decisions): Win7-classic layout — taskbar, start
button + compact start menu, tray, desktop icons — rendered modern flat,
classy black & white, ONE parameterized accent color picked from rendered
mockups inside this brief. Applies to the whole desktop and the lock
screen. Depends on 08; best after 11–13 exist so the mockups are honest.

## Files you OWN

- Frontend design tokens (Tailwind config / CSS vars: mono palette +
  accent variable), fonts decision (fork ships Space Grotesk + Inter —
  keep or replace, record it)
- Taskbar, start menu, tray, desktop-icons components (evolve the fork's
  chrome into the Win7-classic layout)
- Window chrome (title bars, borders, min/max/close) in the B&W language
- Lock screen skin (brief 10's screen, branded)
- ~a dozen surface icons (logo/start button first — it's every
  screenshot)

## What to do

1. Tokenize: strip the fork's palette to near-black/off-white surfaces +
   one accent var; light + dark variants; pick shipped default.
2. Build taskbar (window buttons, tray with clock), start menu (app list
   + power/lock), desktop icons — the Win7 muscle-memory layout.
3. Generate 3–4 accent candidates (e.g. crimson, cobalt, emerald,
   signal-orange), screenshot the same desktop in each, present mockups;
   record the pick in wiki/decisions.md.
4. Re-skin the surviving productivity apps' chrome to match (content
   areas can stay simple).

## Acceptance

The desktop reads instantly as "Windows-7-classic, but B&W with an
accent"; start menu/taskbar/tray/desktop icons all function; accent
decision recorded in decisions.md; no fork-era branding remains visible.

---

**Outcome (2026-07-17):** DONE. Full retokenize (near-black/off-white +
one `--accent` var, light/dark via `[data-theme]`, dark shipped default);
Win7-classic chrome: bottom Taskbar (window buttons, tray + clock), start
button with new geometric hourglass logo, compact StartMenu (apps + Lock/
Log off); flat B&W window chrome; lock screen + first-run wizard branded;
xterm themed from tokens; fork TopBar deleted; index.html title →
ImbatranimOS. Fonts kept (Space Grotesk UI + Inter). Accent: 4 presets in
Settings (crimson/cobalt/emerald/signal-orange), crimson `#c0263a`
shipped as PROVISIONAL default — final pick is the user's. Browser-
verified live. Polish backlog noted (taskbar previews, self-hosted fonts,
z-index growth).
