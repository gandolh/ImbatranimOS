// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// ImbatranimOS documentation site.
//
//   • Narrative  → synced from corpus/ by scripts/sync-corpus.mjs into
//                  src/content/docs/wiki/ (do not edit those by hand).
//   • Reference  → generated into public/reference/ by TypeDoc (core) and
//                  Compodoc (backend); served as static sub-sites.
//
// Change the `site`/`base` below if you deploy under a sub-path (e.g. a Caddy
// route like /docs). Left at root for `astro preview` and local use.
export default defineConfig({
  integrations: [
    starlight({
      title: 'ImbatranimOS',
      description:
        'A real little computer whose screen is a browser tab — architecture, decisions, status, and API reference.',
      tagline: 'The browser is the screen; the container is the computer.',
      customCss: ['./src/styles/theme.css'],
      // Light theme only — no toggle (see the two component overrides).
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/gandolh/ImbatranimOS',
        },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'A tour of the desktop', link: '/tour/' },
            { label: 'Architecture at a glance', link: '/architecture/' },
          ],
        },
        {
          label: 'Understand the OS',
          items: [
            { label: 'The ideas that empower it', link: '/ideas/' },
            { label: 'The technology', link: '/stack/' },
            { label: 'Patterns & techniques', link: '/patterns/' },
          ],
        },
        {
          label: 'Deep dive — from the corpus',
          items: [
            { label: 'What it is', link: '/wiki/overview/' },
            { label: 'Architecture', link: '/wiki/architecture/' },
            { label: 'OS layering — the compositor seam', link: '/wiki/os-layering/' },
            { label: 'Decisions (locked)', link: '/wiki/decisions/' },
            { label: 'Open questions', link: '/wiki/open-questions/' },
          ],
        },
        {
          label: 'Status & roadmap',
          items: [
            { label: 'Status snapshot', link: '/wiki/status/' },
            { label: 'Change log', link: '/wiki/log/' },
          ],
        },
        {
          label: 'API reference',
          items: [
            { label: 'How the reference is generated', link: '/reference/' },
            { label: 'Backend (Compodoc) ↗', link: '/reference/backend/', attrs: { target: '_blank' } },
            { label: 'Core surface (TypeDoc) ↗', link: '/reference/core/', attrs: { target: '_blank' } },
          ],
        },
      ],
    }),
  ],
})
