# Brief 76 — Git GUI and the REST API Client install as Developer

## Context

Two developer tools leave the image and install together as the Developer
group. The OS keeps the work that needs the server as its own services: the
`git` module runs git on repos in home, and `http-proxy` sends a request
behind the SSRF guard. The apps are the features and UI on top
([decisions-marketplace-suites.md](../../wiki/decisions-marketplace-suites.md#the-os-keeps-the-minimum-apps-add-on-top-2026-11-06)).
The Code Editor stays built in. Promoted from the todo
`git-gui-and-rest-api-client-join-developer`.

| App | Source / tests | Leans on | System calls |
|---|---|---|---|
| Git GUI | 1,947 / 326 | `git` (2,768 lines), its `recents` routes | `http`, `intents`, `notify` |
| REST API Client | 2,946 / 1,115 | `http-proxy` (783 lines) | `fs`, `http`, `intents`, `notify` |

After brief 69 the REST API Client's collections are already in its data
folder, and after brief 70 it attaches files by picker. The steps every move
shares are the checklist in
[research-imbatranim-apps-layout.md](../../wiki/research-imbatranim-apps-layout.md#4-moving-one-app-the-checklist).

## Depends on

- brief 64 (the group layout);
- brief 69 (data folders);
- brief 70 (grants).

## Owner decisions (settled 2026-11-06)

1. **The group.** The two install as Developer (descriptor id `developer`),
   keeping their ids.
2. **`git` and `http-proxy` stay in the OS**, trimmed to the work that needs
   the server. Whatever in them serves only the app moves to the app: Git
   GUI's recent repos leave the `git` module's `recents` routes for its
   state folder (`system.data`, kind `state`), moved once.
3. **Uninstalling** keeps the data unless "Also remove its data" is ticked.

## What to do

1. The checklist's steps 1-4 for both apps, in a new Developer group.
2. Git GUI's recents move per decision 2: a one-time copy at the first boot
   after the release, then the `recents` routes go from the `git` module.
3. Check nothing outside the two apps opens them (Files, the Code Editor, the
   palette). If something does, apply checklist step 5.
4. The walk (checklist step 6):
   - **Before:** a repo in home with a staged change, a saved REST request
     with an environment variable, and Git GUI's recents.
   - **After installing Developer:** commit and send the request; the recents,
     the saved request and the environment are back.
   - **Uninstall, then reinstall:** they are still there.
5. Corpus (checklist step 7).

## Files you OWN

- in imbatranim-apps: the Developer group
- in this repo: `marketplace/developer.json`, `ICONS`,
  `apps/add-ons/git-gui/` and `apps/add-ons/rest-api-client/` (deleted),
  their `manifest.ts` lines, the `git` module's `recents` routes (removed),
  `package-lock.json`, the corpus pages

## Files you must NOT touch

- The rest of the `git` module, and `http-proxy`.

## Acceptance

- Tests green in both repos; the walk holds.
