---
summary: Two themes ship. Apricot (cream and peach, pastel accents, rounded corners, Figtree) is the default, and Classic (today's black and white with crimson) stays selectable in Settings. Light is the default mode, there is no glass, and a machine with saved settings moves to Apricot light once on upgrade. Settled with the owner 2026-11-02 in the grill on brief 07, revisiting the locked identity; the layout is unchanged. On 2026-11-03 Apricot's rounding was extended to list rows and in-window boxes, and selection keeps a deep border while today stays strong.
updated: 2026-11-03
---

# Decisions: themes (2026-11-02)

Settled with the owner on 2026-11-02 in the grill on brief 07 (a warmer look).
The owner picked from a canvas showing three warm directions (Apricot, Sage,
Lavender) and today's look, each in light and dark. Its source, with every
colour, radius and shadow value below, is
[assets/themes-2026-11/Desktop.dc.html](assets/themes-2026-11/Desktop.dc.html)
(the `looks()` method). Changing one of these needs an explicit revisit and a
`log.md` entry.

This revisits the locked identity: "modern flat, classy black & white with
parameterized accent colors" ([decisions-iso-era.md](decisions-iso-era.md)),
crimson as the default accent ([decisions.md](decisions.md), 2026-07-19), and
dark-first with zero radius ([ui-conventions.md](ui-conventions.md)). The
Windows-7-classic layout is not revisited: the taskbar, Start button and menu,
tray and desktop icons stay where they are, and every way of finding things
stays the same.

## Apricot is the default theme; Classic stays as a theme
_2026-11-02_ — The desktop ships two themes. Apricot is the default: cream and
peach surfaces, five pastel accents (Apricot, Rose, Butter, Sage, Sky), a
sunset-hills wallpaper, rounded corners and Figtree as the UI font. Classic is
today's look, kept whole: black and white with crimson and the other three
presets, the dots, grid and linen wallpapers, square corners and Space Grotesk.
Settings → Appearance picks the theme from preview cards, above the mode.
Rejected: replacing today's look with no way back; keeping today's look as
the default with the warm one as an option; shipping Sage and Lavender as
extra themes.
**Why**: the owner likes the minimal desktop but wanted it "warm, calm and
chill". Keeping Classic costs a second set of values to check. Sage and
Lavender would have doubled that again.
- *Consequence*: every app, add-on, kit app and imbatranim-office app has to
  work in four combinations: two themes, each in light and dark.
- *Consequence*: each theme carries its own accent presets and wallpapers.
  A theme changes token values, never token names, so add-ons and kit apps
  keep compiling.
- *Consequence*: the pastel accents only pass contrast with dark text on them,
  so `--accent-on` is dark in Apricot. Where the accent is used as text (the
  taskbar's "OS", a selected item's label), Apricot needs a deeper shade of
  it: a second accent variable beside `--accent`.
- *Consequence*: the zero-radius rule (`* { border-radius: 0 !important }` in
  `apps/core/src/index.css`) becomes Classic's only, and
  [ui-conventions.md](ui-conventions.md) changes with the build.

## Light is the default mode
_2026-11-02_ — A new machine starts in light. Dark stays one click away in
both themes.
Rejected: dark by default, as today; following the device's setting.
**Why**: pastels read softer on light, and the owner picked light for other
apps too.

## No glass
_2026-11-02_ — Apricot is flat: no `backdrop-filter` blur on the taskbar,
Start menu or title bars.
Rejected: Aero-style glass with an off switch in Settings; glass always on.
**Why**: the owner's call. It also keeps "lightweight is identity" without a
frame-time question, so brief 07's glass measurement drops out.

## Figtree is Apricot's UI font
_2026-11-02_ — Apricot's chrome uses Figtree, bundled as a font file the way
Space Grotesk is. Classic keeps Space Grotesk. Inter stays the content font in
both themes.
Rejected: Space Grotesk in both themes; Nunito; DM Sans.
**Why**: much of the warmth on the canvas came from the font, and Space
Grotesk reads technical.
- *Consequence*: one more bundled font file, and text widths shift a little in
  every app.

## A machine with saved settings switches to Apricot light once
_2026-11-02_ — On the first start after the update, a machine whose saved
appearance predates themes moves to Apricot light, with Apricot's default
accent and wallpaper. From then on the saved choice holds.
Rejected: keeping what is saved, which would leave the owner's machine on
Classic dark.
**Why**: it is a single-owner machine, the owner asked for the new look, and
Classic is one click away.

## Apricot rounds list rows and in-window boxes too
_2026-11-03_ — After building briefs 08-15, the owner chose to carry Apricot's
corners into window content. In Apricot:
- list rows (File Manager's list, search results, the playlist, the palette)
  are rounded and inset from the list's edges, as on the canvas;
- bordered boxes and cards inside windows take the control radius.

Panels that fill a whole side of a window (sidebars, toolbars, status bars)
stay square. Classic is square throughout, as before. This narrows the house
rule "in-window content is flat" ([ui-conventions.md](ui-conventions.md) rule
9) to Classic.
Rejected: rounding everything but File Manager, whose list is a table; keeping
rows and boxes square.
**Why**: square boxes and full-width bars beside rounded buttons read as
unfinished in Apricot.
- *Consequence*: File Manager's list is a table, and a collapsed table can't
  round a row. In Apricot it switches to separated borders and puts the row's
  fill on its cells (brief 17, 2026-11-03), rather than leaving `<table>` as
  first planned. Its keyboard, columns and virtualisation are unchanged.

## Selection keeps a deep border; today stays strong
_2026-11-03_ — In Apricot, a selected chip or toggle has the pastel fill with
a border in the strong accent. The calendars' "today" marker stays the strong
accent with white text, as a marker, not a selection.
Rejected: borderless pastel chips as on the canvas; a pastel today.
**Why**: the pastel is about 1.8:1 against cream, so without the border the
chosen chip is hard to spot. A strong today keeps the current day apart from
the date the owner selected.


## Start's contents follow current desktops, not Windows 7
_2026-11-06_ — This revisits "every way of finding things stays the same"
above, for Start's contents only. In the imbatranim-apps grill, the owner
first chose Windows 7-style folders in Start, then said: "Pick best ui/ux, we
are not stuck with win7 style". Start becomes:
- a search field on top;
- a grid of pinned apps;
- one A-Z list of every app, built in, installed or Linux, with no folders.

This is how Windows 11, ChromeOS and GNOME do it. The taskbar, the Start
button, the tray and desktop icons stay where they are.

Rejected:
- folders per install group, expanded in place;
- Windows 7's Accessories and System Tools folders for built-in apps.

**Why:** search finds an app fastest on a desktop, and pins keep the few
daily apps one click away. Folders made every app a tap deeper and made
people remember which group installed it. Groups stay a Marketplace idea,
the unit you install. Built in the todo
[start-gets-search-pins-and-an-a-to-z-list](../todos/start-gets-search-pins-and-an-a-to-z-list.md).
