# ImbatranimOS docs

Start with the [main README](../README.md). This folder holds what it links to.

| File | What it covers |
|---|---|
| [getting-started.md](getting-started.md) | Running it with Docker, the first visit, putting it on the internet, developing, the scripts |
| [architecture.md](architecture.md) | The container, the desktop and the apps, and how opening the Terminal flows through them |
| [adding-an-app.md](adding-an-app.md) | The add-on contract and the four steps to add an app to the desktop |
| [backup.md](backup.md) | Where your data lives, backing it up and restoring it, and what to do about a lost password |
| [images/](images/shots.md) | The screenshots and GIF used in the README, and how each was made |

Going deeper:

- [infrastructure/README.md](../infrastructure/README.md): HTTPS behind Caddy, the sign-in, the Browser's second port, the dev container's sign-in
- [marketplace/README.md](../marketplace/README.md): the app catalog's format and apps installed from a URL
- [iso/README.md](../iso/README.md): the older kiosk ISO
- Docs site: [apps/docs](../apps/docs/README.md) builds a Starlight site from the corpus, plus an API reference generated from the code (`npm run docs`)
- Project wiki: [corpus/](../corpus/index.md) has the decisions, the status and the briefs that built it
