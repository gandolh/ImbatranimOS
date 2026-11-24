---
summary: Rounds 21-25 of the performance sweep in full. Round 21 measured a lazy kit Tooltip (a wheel step in a 20,000-file folder 45.6 to 32.6 ms) and filed it as brief 119, since opening the folder missed its bar. Round 22 had Settings mount a section's content when it scrolls near (opening it 288 to 61 ms of main thread, the backend's CPU about 560 to under 10 ms). Round 23 measured the desktop icon's drag at boot and a worker for the Nix package index and left both. Round 24 measured Firefox's spare processes (PSS 519 to 439 MiB) and filed brief 120 for the owner. Round 25 capped npm's cache for Marketplace builds at 256 MB (an update with new dependencies added up to 16 MB for good, which `npm cache verify` keeps).
updated: 2026-11-24
---

# The performance sweep, rounds 21-25

The sweep's method and the list of rounds are on [research-performance-sweep.md](research-performance-sweep.md).
Rounds 16-20 are on [research-performance-sweep-4.md](research-performance-sweep-4.md).

## Round 21 (2026-11-24): a kit tooltip that mounts when asked for, measured and filed

**The bar, written after the bound and before the lazy version:** ship only if a wheel step in the 20,000-file folder
takes at least 20% less main thread and opening it at least 15% less, with the tooltip behaving as today (the hover
delay, leaving, a second hover, keyboard focus, a click).

**What it was.** Each kit `Tooltip` mounts Base UI's Provider, Root and Trigger whether or not it ever opens; the
File Manager wraps five buttons a row in one, Paint about 40 on its toolbar and palette. The upper bound, every
tooltip replaced by its child alone, set what there was to win.

| Medians of six | Today | No tooltips (the bound) | Lazy tooltip |
|---|---:|---:|---:|
| A wheel step: main thread / script | 45.6 / 30.0 ms | 30 / 15 ms | 32.6 / 16.8 ms (−29% / −44%) |
| Opening the folder: main thread | 154 ms | 131 ms | 144 ms (−7%) |
| Heap growth opening it | 8.2 MiB | 5.6 MiB | 5.6 MiB (−32%) |
| Paint's window opening | 98 ms | 62 ms | 78 ms |

The lazy version rendered the child alone until a mouse `pointerenter` or a focus, then mounted Base UI's tooltip,
controlled. In a real tab it behaved as today. Opening the folder missed the bar (the rows' own work dominates it),
so it was not built; [brief 119](../briefs/done/119-a-kit-tooltip-that-mounts-when-first-asked-for.md) holds the
design, the numbers and a bar on scrolling and heap, with the kit apps in imbatranim-apps to check first.

## Round 22 (2026-11-24): Settings mounts a section when it scrolls near

**The bar, written before measuring:** ship only if opening Settings costs at least 30% less main thread and 50%
less backend CPU, every section appears when scrolled to, and a Marketplace intent still reaches its row.

**What it was.** Settings is one scrolling page, and every section mounted on open: about 1,300 components (a
`Select` for each of the 67 file types in Default apps among them) and 13 requests, five of them folder-size walks on
the server, though most opens change the theme at the top.

**What changed** (`24262d9`). `DeferredSection` mounts a section's content once it comes within 600 px of the page's
scroller, at once for a Marketplace intent and where `IntersectionObserver` is missing; until then a placeholder of
the section's usual height keeps the scrollbar honest. Headers still render. Security and About (the footer's
version) stay eager.

| Opening Settings, median of six | Before | After |
|---|---:|---:|
| Main thread | 288 ms | 61 ms |
| Script | 105 ms | 22 ms |
| Backend CPU | about 560 ms | under 10 ms |

Scrolled to the bottom, every section showed the same content as before; a Marketplace intent opened its row.

## Round 23 (2026-11-24): the boot's icon drag and the package index, measured and left

**The desktop icon's drag at boot.** At 4× CPU the boot reaches the taskbar in about 450 ms, and framer-motion's
drag setup for the icons showed in the profile. With the icons' drag removed outright (the bound), five warm boots
each way: to the taskbar 426-446 ms against 438-445, script 227-236 against 207-241. No gain worth copying
framer-motion's drag by hand; left.

**The Nix package index in a worker.** The bar, written before measuring: ship only if the backend's RSS growth after
the first Linux apps search drops at least 30%, the API's p95 during the index load drops at least 50%, and the
results are byte-identical. The index (380 MB) was already streamed, with about 14 MB of rows kept and a compact copy
on the `/nix` volume. Two runs each in a container:

| | In the backend | In a worker |
|---|---:|---:|
| First search (building the index) | 5.7-6.0 s | 5.4-6.1 s |
| `/health` p95 during it | 2-4 ms | 2-3 ms |
| RSS growth, first build | 34-38 MiB | 31-32 MiB |
| A later search from the copy | 154-240 ms | 381-424 ms |

The results were identical (29,311 bytes), but there was no stall to remove: the event loop already stayed free
while the index loaded. Reverted.

## Round 24 (2026-11-24): Firefox's spare processes, measured and filed

Firefox is the largest thing in the 1 GiB container (about 1.16 GiB of container memory for one window,
[infrastructure/README.md](../../infrastructure/README.md)). Firefox 159.0 from Nix at the pin, started from the OS's
Terminal in a real session on one local page, after a first launch had made its profile; PSS summed over its
processes, two runs each:

| | Processes | RSS | PSS |
|---|---:|---:|---:|
| Firefox's defaults | 13 | 1,182-1,184 MiB | 519-522 MiB |
| `dom.ipc.processPrelaunch.enabled` false | 10 | 938-942 MiB | 495-501 MiB |
| and `browser.newtab.preload` false | 9 | 777 MiB | 439 MiB (−16%) |

The main process holds 287 MiB of the default's PSS, the tabs 74, 44, 28 and three of 16. The two preferences stop
Firefox starting a spare content process and a hidden new-tab page ahead of need. Nix's Firefox reads
`/etc/firefox/policies/policies.json`, which is how they were set; but any active policy makes Firefox's settings say
the browser is managed by an organization, and no bar was written before this measurement. Both make it the owner's
call: [brief 120](../briefs/done/120-firefox-starts-fewer-processes-ahead-of-need.md).

## Round 25 (2026-11-24): npm's cache for Marketplace builds has a cap

**The bar, written before measuring growth:** a rule ships only if, after the catalog installs at one
imbatranim-apps commit and updates to another, the cache holds at most 1.5× what one set of installs needs, and a
reinstall takes no more than 20% longer than with today's cache.

**What it was.** Builds share `~/.imbatranim/apps/.cache/npm`, and npm never removes a package it fetched.
`npm cache verify` collects only content its index no longer names, and the index names every version ever fetched.
Measured between two pins of imbatranim-apps (`40450da`, 2026-11-10, and the current `58482b5`):

| | Cache after | Install |
|---|---:|---:|
| The three static suites at the old pin | 29 MB | about 3 s each |
| The same at the new pin | 30 MB | about 3 s each |
| imbatranim-office's full `npm ci`, old pin | 161 MB | 22.4 s |
| The same at the new pin | 177 MB | 20.0 s |
| `npm cache verify` | 177 MB (836 entries, nothing collected) | 0.3 s |

So an update with dependency changes adds up to 16 MB for good, and the repository's lockfile changed a dozen times
between 2026-10-23 and 2026-11-15.

**What changed** (`b8b7a5c`). Before a build the cache is emptied once it holds more than 256 MB (about 1.5× what the
whole catalog needs), and the build log says so. Builds run one at a time and nothing else uses the cache.
`trimNpmCache` reuses `directorySize`, which stops counting past the cap and follows no symlink. A full install at the
new pin with the cache emptied took 22.1 and 20.8 s, warm 23.1 and 21.5 s: extracting 65,000 files dominates, not
fetching them (on the VPS fetching 170 MB costs more than here, a few seconds once per cap).
