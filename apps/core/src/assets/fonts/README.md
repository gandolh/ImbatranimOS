# Vendored fonts

Each file is one family's latin subset, variable on the `wght` axis, served
from the desktop's own origin. `index.css` says why they are vendored. All
three are under the SIL Open Font License 1.1.

| File | Family, version | Source | Used for |
|---|---|---|---|
| `figtree-latin-var.woff2` | Figtree 2.002, `wght` 300-900 | `@fontsource-variable/figtree` 5.3.0, `files/figtree-latin-wght-normal.woff2` | Apricot's UI font |
| `space-grotesk-latin-var.woff2` | Space Grotesk 2.000, `wght` 300-700 | `@fontsource-variable/space-grotesk` 5.3.0, `files/space-grotesk-latin-wght-normal.woff2` | Classic's UI font |
| `inter-latin-var.woff2` | Inter 4.001 (`git-66647c0bb`), `wght` 100-900 | `@fontsource-variable/inter` 5.3.0, `files/inter-latin-wght-normal.woff2` | the content font, both themes |

Fontsource builds these from Google Fonts. The Space Grotesk and Inter files
predate this note. Their source was found on 2026-11-03 by comparison: each
is byte-for-byte the Fontsource 5.3.0 file named above. Figtree was taken
from the same release that day.

The latin subset has no ă, ș or ț, so those letters fall back to the next
font in the stack in every theme.

To update one, download the file named in the table from the npm package,
for example `https://cdn.jsdelivr.net/npm/@fontsource-variable/figtree@<version>/files/figtree-latin-wght-normal.woff2`,
replace the file here and update this table.
