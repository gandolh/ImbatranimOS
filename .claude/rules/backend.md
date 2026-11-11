---
paths:
  - "apps/backend/src/**"
---

# The backend (`apps/backend/src`, NestJS)

- The shape is NestJS: modules, controllers and providers with constructor injection. Constructor parameter properties
  and decorators stay, because Nest reads them through `emitDecoratorMetadata`. Never turn on `erasableSyntaxOnly`
  here, and never write a type-only import for something a constructor injects.
- **Every route and every WebSocket sits behind session validation.** The server is exposed to the internet: no
  unauthenticated route, no default password, ever.
- Request bodies are DTOs, validated through zod or class-validator pipes, never read by hand.
- The terminal is a real PTY and the files are the real file system. Anything that fakes the system is off-soul.
- The shell user is `imbatranim`, with no sudo. No change grants root or runs the container privileged.
- Typed lint runs the type-checked set: no floating promises (an error), no `any`, no `!` in source. The environment
  is read in many files today (a warning); add no new `process.env` read where a config value already exists.
- No `console`: Nest's `Logger` is the logger. The database service may print before it exists.
- The backend stays on TypeScript 5.9 and its own tsconfig (`apps/backend/node_modules/typescript`); the root's
  TypeScript 6 runs the lint and the web workspaces.
- Tests: Jest, `*.spec.ts` beside the source and the e2e specs in `apps/backend/test/`.
