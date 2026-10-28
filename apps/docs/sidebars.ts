import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

// Doc items are checked at build time: a sidebar entry for a page that does not
// exist fails the build instead of rendering a dead link. Doc ids are paths
// under docs/ without the extension (docs/wiki/status.md → 'wiki/status').
//
// The corpus pages are listed by hand, so the sidebar stays curated (labels,
// order). scripts/sync-corpus.mjs publishes every wiki page not in its DENY set;
// a new wiki page builds without a sidebar entry until one is added here.
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Start here',
      collapsible: false,
      items: [
        // The landing is src/pages/index.mdx, a page rather than a doc, so it has
        // no sidebar (Starlight's splash template).
        { type: 'link', label: 'Overview', href: '/' },
        { type: 'doc', id: 'tour', label: 'A tour of the desktop' },
        { type: 'doc', id: 'architecture', label: 'Architecture at a glance' },
      ],
    },
    {
      type: 'category',
      label: 'Understand the OS',
      collapsible: false,
      items: [
        { type: 'doc', id: 'ideas', label: 'The ideas that empower it' },
        { type: 'doc', id: 'stack', label: 'The technology' },
        { type: 'doc', id: 'patterns', label: 'Patterns & techniques' },
      ],
    },
    {
      type: 'category',
      label: 'Deep dive — from the corpus',
      collapsible: false,
      items: [
        { type: 'doc', id: 'wiki/overview', label: 'What it is' },
        { type: 'doc', id: 'wiki/architecture', label: 'Architecture' },
        { type: 'doc', id: 'wiki/os-layering', label: 'OS layering — the compositor seam' },
        { type: 'doc', id: 'wiki/ui-conventions', label: 'UI conventions' },
        { type: 'doc', id: 'wiki/code-graph', label: 'The code-graph layer' },
        { type: 'doc', id: 'wiki/glossary', label: 'Glossary' },
        { type: 'doc', id: 'wiki/decisions', label: 'Decisions (locked)' },
        { type: 'doc', id: 'wiki/decisions-pivot-era', label: 'Decisions — the pivot era' },
        { type: 'doc', id: 'wiki/decisions-iso-era', label: 'Decisions — the ISO era' },
        { type: 'doc', id: 'wiki/decisions-estate-era', label: 'Decisions — the estate era' },
        { type: 'doc', id: 'wiki/decisions-marketplace', label: 'Decisions — the marketplace' },
        { type: 'doc', id: 'wiki/real-os-gaps', label: 'Real-OS gaps' },
        { type: 'doc', id: 'wiki/open-questions', label: 'Open questions' },
      ],
    },
    {
      type: 'category',
      label: 'Status & roadmap',
      collapsible: false,
      items: [
        { type: 'doc', id: 'wiki/status', label: 'Status snapshot' },
        { type: 'doc', id: 'wiki/status-history', label: 'Status history (to 2026-08-06)' },
        { type: 'doc', id: 'wiki/backlog-2026-07-31', label: 'Backlog — 2026-07-31 sweep' },
        { type: 'doc', id: 'wiki/feature-exploration-2026-08-06', label: 'Feature exploration — 2026-08-06' },
        { type: 'doc', id: 'wiki/backlog-2026-08-07', label: 'Backlog — 2026-08-07 sweep' },
        { type: 'doc', id: 'wiki/log', label: 'Change log' },
      ],
    },
    {
      type: 'category',
      label: 'API reference',
      collapsible: false,
      items: [
        { type: 'doc', id: 'reference', label: 'How the reference is generated' },
        // Generated HTML in static/, not a Docusaurus route: `pathname://` makes
        // it a plain link (new tab, baseUrl still applied) instead of a router
        // navigation that would 404.
        { type: 'link', label: 'Backend (Compodoc) ↗', href: 'pathname:///reference/backend/' },
        { type: 'link', label: 'Core surface (TypeDoc) ↗', href: 'pathname:///reference/core/' },
      ],
    },
  ],
}

export default sidebars
