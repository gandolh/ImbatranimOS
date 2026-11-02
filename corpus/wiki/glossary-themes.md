---
summary: Vocabulary for the desktop's themes (2026-11-02) — theme, mode, Apricot and Classic, and the synonyms they displace (look, skin, dark theme, the old look). The rest of the vocabulary is in glossary.md.
updated: 2026-11-02
---

# Glossary: themes

Split from [glossary.md](glossary.md), same rules: definitions only, one name
per concept, the synonyms it displaces under _Avoid_. The calls behind these
terms are in [decisions-themes.md](decisions-themes.md).

**Theme**:
A named set of values the whole desktop is drawn with: surface and text
colours, accent presets, wallpapers, corner radius and UI font. Two exist,
Apricot (the default) and Classic. A theme changes token values, never token
names.
_Avoid_: look, skin, style, appearance. In code, the `data-theme` attribute
and the add-on contract's `SystemAppearanceState.theme` keep their names for
compatibility and mean *mode*, not theme.

**Mode**:
Light or dark, chosen inside a theme. Every theme has both.
_Avoid_: theme, dark theme, colour scheme.

**Apricot**:
The default theme: cream and peach, pastel accents, rounded corners, Figtree.
_Avoid_: the warm look, the new look, the pastel theme.

**Classic**:
The theme that keeps the desktop as it was before 2026-11-02: black and white
with crimson, square corners, Space Grotesk.
_Avoid_: the old look, the black-and-white theme, the default theme.
