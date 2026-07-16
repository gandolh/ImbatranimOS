// Compatibility shim: registry.tsx imports `ReplInterpreter` from this path.
// The REPL command-runner has been replaced by a real Terminal (Brief 11).
// This re-export keeps the frontend building until registry.tsx is updated to
// import `Terminal` directly (see handoff). Prefer importing from ./Terminal.
export { Terminal as ReplInterpreter } from './Terminal'
