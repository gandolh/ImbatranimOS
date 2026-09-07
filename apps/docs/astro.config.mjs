// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// The deployed base path, baked in rather than injected at deploy time.
//
// vps-deploy ships what this repo already built and VERIFIES this base — it does
// not set it. That is the estate's rule for the case that matters most (Ward's
// UI does the same, see vps-deploy/stacks/ward.ts): a variable the deploy passes
// that changes nothing is a variable that can silently disagree, whereas a value
// baked here and checked there cannot. Build with `npm run docs`; a wrong base
// fails the deploy by name instead of shipping a page whose every asset 404s.
//
// DOCS_BASE still overrides it, for building a copy to serve from somewhere else.
const base = process.env.DOCS_BASE ?? '/imbatranim-os/docs/'

export default defineConfig({
  base,
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
            { label: 'Glossary', link: '/wiki/glossary/' },
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
