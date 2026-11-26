---
summary: Read and measured 2026-11-26, Effect 4.1.6 (released that day; 4.0.0, an LTS line, on 2026-10-01), on the owner's question whether the `effect` library could make imbatranimOS faster or its code better. Verdict, don't adopt, not even narrowly. A realistic subset (typed error, Schema, retry, timeout, a bounded batch, acquire/release, a Stream) bundles to 135.6 kB, 37.7 kB gzip with the desktop's Vite, against 0.9 kB gzip for the helpers it would replace and the 410.9 kB entry. Each operation costs 1-3 µs more than async/await (100,000 small handlers 26.7 to 291 ms on Node 24, 20,000 stats six at a time 124.7 to 158.2 ms), so it speeds up nothing the sweeps measured. A program that imports it type-checks about 1 s slower and needs about 135 MB more. It runs under NestJS with TypeScript 5.9 decorators and type-checks with TypeScript 6, but v4 ships only ES modules and the backend's Jest cannot load it. The wins it offers come cheaper from what the repo already has.
updated: 2026-11-26
---

# Research: Effect (2026-11-26)

The owner asked whether Effect (effect.website, the npm package `effect`) could improve the performance or the code
of imbatranimOS. I read Effect's README, `packages/effect/README.md` and `MIGRATION.md` on `Effect-TS/effect` main,
the v4 docs' source at `Effect-TS/website@1427eeb` (2026-11-26; effect.website itself did not resolve from the
session), and the package's own declarations. Everything was measured in a scratch project outside the repo, deleted
afterwards. Nothing was added to the repo.

## Verdict: don't adopt

| What Effect offers | What the repo has today | Verdict |
|---|---|---|
| Speed | Measured wins come from the shape of I/O (batched stats, streamed zips, fewer renders); Effect adds 1-3 µs an operation | no gain, a cost on hot paths |
| Typed errors | Nest's HTTP exceptions (250 `throw new …Exception` in 33 backend files), `try` blocks | not worth a second error model |
| Retry and backoff (`Schedule`) | three hand-rolled backoffs on the web, about five lines each | keep them |
| Timeouts and cancellation | `AbortSignal.timeout` (3 backend files); the kit's `system.http` takes `signal` and `timeout` | use what exists, see below |
| Resource lifetimes (`Scope`) | idempotent `dispose()` (PtySession), `onModuleDestroy` (10 files), `finally` (13 files) | already sound, tested with injected timers |
| Concurrency limits | `settleEach` (24 lines), the Marketplace's one-build queue (about 20 lines) | keep them |
| Streams | Node's `pipeline` (7 files; the zip streaming of sweep rounds 33-35) | keep them |
| Dependency injection (`Layer`) | NestJS (44 `@Injectable`, 23 `@Controller`) | a duplicate |
| Schema | class-validator (265 decorators in 23 files) and zod 4 (6 files) on the backend; hand-written guards on the web | a third schema library |

Effect cannot make the OS faster: nothing the performance sweep measured was slow for want of a fiber runtime, and
the runtime adds work to every operation. The code would be more uniform only after a rewrite large enough to
displace Nest's error and DI models, against "Lightweight is identity" and with the backend's tests unable to load
it. No narrow use passes either. The best candidate, the Marketplace's build pipeline (19 files, 4,684 lines: a
queue, clones, builds, clean-up on failure, timeouts), would gain interruption, but nothing in it asks for that today
(there is no Cancel for a running build), and its tests run on the same Jest. So no todo is filed.

## What Effect is

A value of type `Effect<A, E, R>` describes a program that succeeds with `A`, fails with a typed `E` and needs
services `R`. A fiber runtime runs it, with interruption, so timeouts and cancellation reach every step. Around that
core sit services (`Context`, `Layer`), resources (`Scope`, `acquireRelease`), retry and repeat policies
(`Schedule`), `Stream`, and `Schema` for decoding and encoding. In v4 the HTTP, RPC, SQL, CLI and AI modules moved
into the one package. 4.x is LTS (at least three years of fixes). It needs TypeScript 5.9 or newer with `strict`,
and Node 22.19 or newer. It ships ES modules only, where v3 also shipped CommonJS. There were 15 releases from
4.0.0 to 4.1.6 in eight weeks. `effect/Schema` is marked stable; its JIT and AOT compilers are experimental.

## The cost, measured

### Bundle

Each entry was bundled whole (nothing external), minified, and gzipped at level 9:

| Entry | Vite 8.3.5 (rolldown) | gzip | esbuild 0.27.2 | gzip |
|---|---:|---:|---:|---:|
| `Effect.runPromise(Effect.succeed(1))` | 29.0 kB | 8.9 kB | 91.4 kB (26.8 with deep imports) | 31.9 kB (9.5) |
| typed error, retry, timeout, `forEach` with concurrency, `acquireRelease` | 63.5 kB | 18.2 kB | 113.1 kB | 39.6 kB |
| `Schema` only: the PTY's three-frame union from a JSON string | 103.1 kB | 28.4 kB | 314.9 kB | 101.6 kB |
| **the realistic subset**: both of the above and a `Stream` | **135.6 kB** | **37.7 kB** | 456.1 kB (103.6 deep) | 147.7 kB (35.2) |
| the same jobs as the repo writes them (`settleEach`, a backoff loop, a guard) | 1.8 kB | 0.9 kB | 1.4 kB | 0.8 kB |
| zod 4.6.7, the same frame | 114.4 kB | 27.5 kB | 454.1 kB | 93.0 kB |
| `zod/mini`, the same frame | 24.0 kB | 6.9 kB | 18.2 kB | 6.2 kB |

Effect's migration guide claims 7.1 kB min+gzip for a minimal program; it measured 8.9 kB here. esbuild needs
`effect/Effect`-style imports to shake the barrel, and rolldown does not. Against the desktop after brief 123, the
entry is 410.9 kB (132.6 kB gzip, Vite's count). The subset in the entry would add 33% raw and 28% gzip. In the
first load (745.8 kB in 57 files, 258.4 kB gzip) it would add 18% and 15%. In an add-on's lazy chunk, it would load
with the first app that uses it. It replaces about 0.9 kB gzip of code, so it is about 42 times the bytes.

### Runtime

Each workload ran in its own process under the repo's runner (`scripts/bench/run.mjs`: two warmups, ten runs, the
median), pinned to one CPU with `taskset`. The 1-minute load average stayed between 0.15 and 1.12, the run
included. All times are in ms.

| Workload | Node 24.22.3 | Node 22.23.5 |
|---|---:|---:|
| **200,000 PTY client frames** (seed 7: 90% input, 8% resize, 1% close, 1% malformed): parse, check, dispatch | | |
| `pty-session.ts`'s `parseMessage`, as it is | 82.6 | 72.2 |
| zod `safeParse` after `JSON.parse` | 83.9 | 77.5 |
| `Schema.decodeUnknownResult` after `JSON.parse` (with the JIT on) | 99.9 (92.8) | 102.8 (73.7) |
| `Schema.is` after `JSON.parse` (JIT) | 125.9 (81.0) | 128.7 (72.4) |
| `Schema.fromJsonString` decode (JIT) | 379.5 (323.6) | 286.7 (244.6) |
| the handler as an Effect, `runSync` a frame | 370.5 | 354.3 |
| the handler as an Effect, `runFork` a frame | 284.5 | 319.4 |
| one `Stream` over all the frames | 411.8 | 364.1 |
| **100,000 small handlers**, three awaits each, one after another | | |
| async/await | 26.7 | 16.1 |
| `Effect.gen` with `Effect.promise`, `runPromise` for each (as a Nest controller would call one) | 291.0 | 265.4 |
| `Effect.fn`, `runPromise` for each | 388.1 | 384.0 |
| all of them inside one Effect program | 230.8 | 152.0 |
| **20,000 `stat`s of 2,000 real files, six at a time** | | |
| `settleEach` (file-manager) | 124.7 | 120.8 |
| `Effect.forEach` with `concurrency: 6` | 158.2 | 139.5 |
| the same two with no I/O | 3.6 / 20.7 | 2.3 / 16.3 |

Per operation, Effect adds about 1.4 µs a frame, 2.6 µs a handler and 0.85 µs a batched item. The PTY's input frames
are keystrokes, so there the cost is invisible. It shows where the OS does many small things. Round 11 took a
20,000-entry Files listing from 630 to 165 ms by dropping a promise per entry
([research-performance-sweep-3.md](research-performance-sweep-3.md)). An Effect step per entry would add an
estimated 20 to 50 ms back (arithmetic, not measured). The Schema JIT builds code with `new Function`, which the
desktop's CSP (`script-src 'self' 'wasm-unsafe-eval'`) forbids, so on the web Schema runs interpreted.

### Type-check

The probes were checked under the web's compiler flags (`packages/tsconfig.base.json`, `skipLibCheck` on), pinned,
taking the median of five, in three sets. A vitest run in another checkout on this machine put the load at 1.0 to
4.6, so the ranges are wide; the gap is steady:

| Program | Wall | Memory | Declaration lines |
|---|---:|---:|---:|
| the plain subset | 0.65-0.82 s | 60 MB | none (TypeScript's own lib only) |
| the zod frame | 0.80-0.95 s | 71 MB | 4,778 |
| one `Effect` import | 1.55-1.81 s | 180 MB | 237,812 |
| the Effect subset | 1.67-2.08 s | 197 MB | 237,812 |

TypeScript 5.9.3 and 6.0.3 came out alike. The check itself is 0.04 to 0.23 s. The rest is reading and binding
the 177 files Effect adds, and the first import pays all of it. For scale, core's app program today holds
186,859 lines of declarations, so Effect alone is 1.27 times that. Each web workspace and the backend is its own
program, and each one that imports Effect pays again.

### The backend

- **Decorators and TypeScript 5.9 work.** A scratch Nest 11.2.7 app with the backend's flags (`module: nodenext`,
  `experimentalDecorators`, `emitDecoratorMetadata`) compiled `import { Effect } from "effect"` in a CommonJS file
  to `require("effect")`. An `@Injectable` with an `@Inject`ed constructor parameter decoded a frame, retried and
  timed out inside Effect, then threw `BadRequestException` on failure. It ran under
  `NestFactory.createApplicationContext` on Node 24.22.3 and 22.23.5, both of which load ES modules through
  `require`. TypeScript 6 type-checked the web probes with no error, as did `skipLibCheck: false`.
- **The backend's Jest can't load it.** Jest 30.4.2 with ts-jest 29.4.11 and the backend's config failed on
  `export` in `effect/dist/index.js`. With ts-jest also transforming `effect`, it failed on `import.meta?.env` in
  `ConfigProvider.js`. The backend's 82 spec files would need Jest's ESM mode, an `import.meta` transform, or a move
  to Vitest first.
- **Memory and image.** Cold, from CommonJS, pinned, median of five (load 2.4 to 2.5): `require("effect")` took
  174-260 ms, +14 MiB heap and +38-47 MiB RSS, because Node loads every module the barrel names. `effect/Effect`
  took 55-71 ms and +4.1 MiB, zod 46-52 ms and +3.5 MiB, and `@nestjs/core` 146-148 ms and +5.7 MiB. The backend
  rests at about 118 MiB (round 6). The package is 64.2 MB unpacked in 3,243 files. After the image strips `.ts`,
  `.map` and `.md`, about 17.5 MB of JavaScript would stay, against 26 MB for all of the image's `node_modules`
  today (round 10).

### Learning, tooling and the kit

- **A second idiom.** Generators, `pipe` and services, beside Nest's classes and React's hooks. The barrel exports
  145 modules. Writing the capped backoff for the probe took three tries against the types: `modifyDelay`'s
  callback takes the step's metadata, and `upTo` takes `{ times }`.
- **The lint net has a hole.** The house config's `no-floating-promises` does not see an Effect that is built but
  never yielded, which silently does nothing. Effect's own checker for that (`@effect/tsgo`, "Floating Effects")
  needs native TypeScript 7 and patches TypeScript in a `prepare` script.
- **The kit's contract.** imbatranim-apps vendors `packages/ui`. An Effect type in its props or in `system.*` would
  tie every kit app to Effect's version, and Effect's unstable modules may break in minor releases. Effect kept
  inside core leaves the kit alone, but then nearly all of the code the survey found sits outside it.

## Where Effect would plausibly apply (the survey)

A snapshot from `grep` on 2026-11-26, without spec and test files, kept for this question only: re-grep before
acting on any of it. The backend is 165 files and 27,065 lines; the web (core, the add-ons and the kit) 450 files
and 55,375 lines.

- **Errors**: `try` in 64 backend files (239 times) and 79 web files (163). Controllers speak Nest's HTTP exceptions.
- **Retries**: none on the backend. On the web: `linux-windows/connection.ts` (1 s doubling to a cap),
  `lib/prefs.ts` (5 s doubling, capped), and the Terminal's `closeReason.ts` (1 to 8 s, five tries), plus a chunk
  retry in `LinuxWindowsService.tsx` and `retry: 1` in `packages/ui/src/queryClient.ts`. The backoff is about five
  lines in each. The bulk is deciding whether to retry at all (`closeReason.ts` spends 196 lines classifying
  closes), and `Schedule` does not do that.
- **Timeouts and cancellation**: `AbortSignal.timeout` in `marketplace/prebuilt.ts`, `linux-apps/channel.ts` and
  `archive/archive.service.ts`; one `AbortController` in `http-proxy.service.ts`. `PtySession` (440 lines) owns a
  detach timer, a ping probe with a timeout and a backpressure poll. Every teardown funnels into one idempotent
  `dispose()`, with the timers injected for its tests. On the web, one `AbortController`
  (`image-viewer/src/lib/useFolderDates.ts`) and 27 `queryFn`s, none of which passes TanStack Query's `signal`.
- **Resources**: the Wayland host's process (`wayland-host.service.ts`: spawn, exit, `SIGTERM` on destroy), the
  PTY, the zip writer's `abort()`, `onModuleDestroy` in 10 files.
- **Concurrency**: the Marketplace's promise-chain queue (`enqueue`, `runQueued`), `settleEach`, and the Browser
  socket's high-water queue (`guarded-socket.ts`).
- **React**: TanStack Query and zustand hold the async state. Effect's binding is a separate package
  (`@effect/atom-react` 4.1.6).

## What to do instead

None of these was measured, and none is filed. Each is the owner's to take or leave.

- **Cancel abandoned requests.** `SystemHttpRequestConfig` already has `signal` and `timeout`. Passing TanStack
  Query's `signal` from each `queryFn` into `system.http` would end a closed window's or a superseded query's
  request, with no change to the kit's contract. Measure it on a 20,000-entry listing before building.
- **One backoff helper** only when a fourth copy appears. Three copies of five lines don't earn a shared module.
- **Schemas**: zod, already a backend dependency, for any new socket frame or descriptor. `zod/mini` (6.9 kB gzip
  here) if the web ever needs one.
- **Concurrency**: `settleEach` moves into the kit when a second app needs it.

## What would change the call

- The backend moves to ES modules, and its tests to Vitest or Jest's ESM mode.
- A subsystem needs many concurrent jobs cancelled as a group (parallel Marketplace builds with Cancel), where
  fibers and `Scope` would replace code the repo would otherwise write.
- The web stack reaches TypeScript 7, where Effect's checker runs.

## How it was measured

Effect 4.1.6, zod 4.6.7, Vite 8.3.5 (the desktop's), esbuild 0.27.2, TypeScript 6.0.3 and 5.9.3. Nest 11.2.7, Jest
30.4.2 and ts-jest 29.4.11 for the backend probe, at the backend's versions. The machine was 4 vCPU Intel Xeon at
2.30 GHz with 15 GiB, no readable cgroup cap, and every timed process pinned to one CPU
([how-we-measure.md](how-we-measure.md)). The frame inputs came from the bench library's seeded `rng`. The runner
wrote its results under a scratch `XDG_CACHE_HOME`. Desktop sizes are brief 123's
([research-performance-sweep.md](research-performance-sweep.md) has the method), and its gzip -9 of the entry is
130.7 kB. The probes are `minimal`, `effect-core`, `schema-only`, `effect-subset`, `plain-subset` and the two zod
frames. The workloads are those in the runtime table. Both were deleted with the scratch project.
