---
summary: Dated status (2026-11-06) of the imbatranim-apps plan, briefs 63-76 - which are built and where (63 rename, 67 WebAssembly, 68 app identity, 72 Start, 73 chooser link), what the owner still owes, and what is open. Plan and brief table in research-imbatranim-apps.md.
updated: 2026-11-06
---

# Status: the imbatranim-apps plan

Grilled and promoted on 2026-11-06; the plan and the brief table are in
[research-imbatranim-apps.md](research-imbatranim-apps.md#7-the-briefs), the
calls in [decisions-app-identity-and-trust.md](decisions-app-identity-and-trust.md).
Each outcome is in `briefs/done/`.

- **63** (done): the repo is renamed. Owner: the GitHub rename, then
  `source.repo` here and the template URL in the Apps repo.
- **67** (`932d92e`, 1.192.0, ready for deploy): WebAssembly on, with
  COOP/COEP on the desktop and `require-corp` on every frame; URL apps get
  WASM without threads. Owner: phone checks on Android and iPhone.
- **68** (`2522407`, 1.196.0, ready for deploy): apps run as their own
  identity (token header, per-file owner and mode). The owner chose a
  stricter default for built-in apps on 2026-11-06; brief 70 flips it with the
  grant flows.
- **72** (`d6ae13d`, fix `baf3f5e`, ready for deploy): Start has search, pins
  and an A-Z list; the fix after walk 1 covers ranking, duplicates and panel
  height.
- **73** (`2f5a039`, ready for deploy): Open With links to the Marketplace
  row.
- Walk 1 passed 11 of 11 on 2026-11-06 (identity, isolation headers, Start,
  chooser link). Walk 2 is pending: Games install, Office PDFs, the WASM
  fixture.
- Open: 64, 65, 66, 69, 70, 71, 74, 75, 76 are not covered here; see their
  briefs and the log.
