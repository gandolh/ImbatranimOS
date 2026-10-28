---
title: Move the Office pin once Sheets computes formulas past row 1000
created: 2026-10-28
status: open
tags: [marketplace, office, sheets, pin]
---

# Move the Office pin once Sheets computes formulas past row 1000

`marketplace/imbatranim-office.json` pins Office to `909c321` since brief
165 (2026-10-28). That commit's Sheets computes a single-cell reference past
row 1000 as `#NAME?` and saves it so: imbatranim-office's todo
`2026-10-28-sheets-formulas-past-row-1000` (its `xlsxMapping.ts` builds each
sheet without a `rowCount`, so Univer keeps its default of 1000 rows). The
office repo was fixing it on 2026-10-28.

Once that fix lands, move `source.ref` to the full 40-hex commit that has
it, as its own small run: install the suite from the new commit in the dev
container, open a workbook with formulas past row 1000, check the saved
values with openpyxl, and note the pin in `log.md`. The descriptor template
was byte-identical from `1ca83c0` to `909c321`; diff it again in case the
fix changed it. The owner pushes the office repo before this one.
