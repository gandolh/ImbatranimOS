# Brief 139 — REST client never overwrites collections it failed to read

Status: **todo** · From the 2026-09-26 improvements sweep. EASY · ADD-ON
(`apps/add-ons/rest-api-client`). Independent. Implement inline.

## Context

`loadData` (`apps/add-ons/rest-api-client/src/api/collectionsApi.ts:48-58`)
catches **every** error and returns `EMPTY_DATA`. Its comment says that is for
"a missing file (first run) or a malformed one", but a 401, a 503, a 500, a
network blip and a JSON syntax error all land there too.
`RestApiClient.tsx:54` starts `data` as `EMPTY_DATA` and replaces it only when
that promise resolves (`:60-68`). Nothing blocks the UI while the load is in
flight, or after it "fails".

Every write persists the whole file from `dataRef.current`: `persist`
(`:71-79`) → `saveData` (`collectionsApi.ts:62-74`) → `PUT /files/content`, a
full overwrite. And `recordHistory` (`:108-122`) calls `persist` after **every
Send**, not just Save. The other callers are `:219` (Save), `:251`, `:281`
(clear history), `:336` (pick environment), `:356` and `:373`.

**Failure:** open the REST client while its load fails — today any request
made 15 minutes after sign-in gets a 401 until brief 144 lands; also a Ward or
storage 503, or a hand-edited `collections.json` with a typo — then send any
request. `collections.json` is rewritten as `{ collections: [], environments:
[], history: [<that one request>] }`. Every saved request and environment is
gone, and nothing on screen says so. A second trigger needs no error at all:
clicking Save before a slow initial load resolves.

## Files you OWN

- `apps/add-ons/rest-api-client/src/api/collectionsApi.ts`,
  `src/RestApiClient.tsx`, and their tests under `src/`

## Files you must NOT touch

- `apps/backend/**` — the files API is correct; the client must not write what
  it did not read.

## What to do

1. `loadData` returns a discriminated result: `{ status: 'ok', data }`,
   `{ status: 'missing' }` (a 404 only — first run, where empty data is
   correct), or `{ status: 'failed', error }` (everything else, including
   malformed JSON; include the parse position if it is cheap to get).
2. `RestApiClient` keeps that load state. Until it is `ok` or `missing`,
   nothing is persisted: Send still works (it is a proxy call), but recording
   history and every collection or environment change are refused behind a
   visible "Saved requests are unavailable: <reason>" banner with Retry.
   Refusing is recommended over queueing — a queue would merge edits into data
   the user never saw.
3. When the failure is malformed JSON, never overwrite the file; offer to open
   it in Notepad through `system.intents.openApp` so the user can repair it.

## Must preserve

- First run (404) still starts empty, and the first Save creates the file.
- The history cap (`MAX_HISTORY`), environments, and brief 77's replay
  behaviour.

## Acceptance

- Unit tests for `loadData`: 404 → `missing`; 401, 503, 500 and a network error
  → `failed`; malformed JSON → `failed`; valid → `ok` with normalised data.
- Component tests: with the load failing, a Send does **not** call
  `http.put`; while the load is pending, Save does not call `http.put`; after a
  successful Retry, Save writes the loaded collections plus the new item.
- The add-on's vitest run, typecheck and lint green.

## Out of scope

- Detecting a concurrent change to `collections.json` from another window —
  brief 155's pattern could be applied here later.
