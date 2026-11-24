# Brief 120: Firefox starts fewer processes ahead of need

**Depends on:** nothing. **Runs after:** 119.

**Before you start:** run `brief-board guide` ([CLAUDE.md](../../CLAUDE.md)).

Filed 2026-11-24 from the performance sweep's round 24
([research-performance-sweep-5.md](../../wiki/research-performance-sweep-5.md)). Measured, not built: it changes
what Firefox's own settings page says, so it is the owner's call.

## Context

- On the VPS the container is capped at 1 GiB, and Firefox is the largest thing in it (infrastructure/README.md:
  one window about 1.16 GiB of container memory).
- Measured 2026-11-24 in a container of the image, Firefox 159.0 from Nix at the pin, started from the OS's
  Terminal in a real session with one local page, after a first launch had made its profile; PSS summed over its
  processes, two runs each:

| | Processes | PSS |
|---|---:|---:|
| Firefox's defaults | 13 | 519-522 MiB |
| `dom.ipc.processPrelaunch.enabled` false | 10 | 495-501 MiB |
| and `browser.newtab.preload` false | 9 | 439 MiB (-16%) |

  The container's memory fell by about 80 MiB. The two preferences stop Firefox starting a spare content process
  and a hidden new-tab page ahead of time; a new tab or window then opens a little slower, and nothing goes away.
- Nix's Firefox reads `/etc/firefox/policies/policies.json` (the process counts above came from it). Any active
  policy makes Firefox show "Your browser is being managed by your organization" in its settings: the cost of
  doing it this way.

## Decisions (to settle first)

1. **Whether the notice is acceptable.** If not: look for a way that sets defaults without a policy (none was found
   for a Nix-installed Firefox; `user.js` is per profile, and the profile is made at first launch).
2. **The file**, if accepted, in the runtime base (`infrastructure/nix/setup-image.sh`):

```json
{
  "policies": {
    "Preferences": {
      "dom.ipc.processPrelaunch.enabled": { "Value": false, "Status": "default" },
      "browser.newtab.preload": { "Value": false, "Status": "default" }
    }
  }
}
```

   `"Status": "default"` leaves both changeable in `about:config`.

## The bar (before measuring again)

- Ship only if Firefox's PSS with one page falls at least 10%, new tabs and windows still open with the new-tab
  page, and the owner accepts the notice.

## Acceptance

- [ ] Measured again under the production cap, the bar written first.
- [ ] `npm run check` exit 0; `bash corpus/lint.sh` OK.
