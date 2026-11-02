# Brief 15 — Check every app in the four combinations

## Context

Settled 2026-11-02 ([decisions-themes.md](../../wiki/decisions-themes.md)):
every app, add-on, kit app and imbatranim-office app has to work in four
combinations: Apricot and Classic, each light and dark. Briefs 08-14 changed
the tokens, accents, selection fills, font, corners, wallpapers and Settings.
This brief walks everything once, fixes what broke, and brings the rules and
status pages up to date. It is the last of the theme briefs; 08-15 deploy
together after it.

Independent of 01-06.

## Spec

1. **Walk** every built-in app and add-on in Apricot light, Apricot dark and
   Classic dark. Classic light was covered by the earlier briefs' unchanged
   screenshots. For each, check:
   - text and icons readable;
   - focus rings visible;
   - selection uses the soft fill (10);
   - nothing clipped by Figtree (11);
   - no stray square or rounded corner (12).

   Use short targeted walks, not a full crawl.
2. **Non-DOM surfaces** that read colours from the appearance contract or CSS
   variables:
   - the Terminal's xterm palette (`repl-interpreter/src/lib/xtermTheme.ts`
     keeps an ANSI-16 palette per mode, checked for contrast; check it on
     Apricot's surfaces);
   - the Code Editor;
   - Snipping Tool's overlays.

   Fix contrast gaps in place.
3. **Fix** what the walk finds, one commit per app where it's more than a
   line. A problem that is a design question goes in the outcome for the
   owner, not into a guess.
4. **Rules and docs**:
   - `ui-conventions.md`: the identity line (§ top: "B&W tokens + ONE accent
     (crimson), dark-first, zero border radius") and rules 6-9 and 11 now
     describe themes, modes, the strong/soft accent, the token radii and the
     per-theme font. The pre-flight checklist asks for a check in Apricot
     light and Classic dark, not just "light".
   - The design-token comment at the top of `index.css`.
   - `status.md`.
5. **Other repos** (note, don't edit): imbatranim-office's apps and Hollow
   build against a snapshot of `packages/ui/src`. Until they re-vendor it,
   they keep:
   - a literal Space Grotesk;
   - `primary-container` on the strong accent;
   - no radius tokens.

   They will look Classic-shaped inside Apricot. List what a re-vendor needs
   in the outcome as an owner step, along with the office pin to move.

## Must preserve

- Classic as it was before 08, apart from fixes to real bugs the walk finds
  (name each).
- Token names and the add-on contract.

## Acceptance

- Every built-in app and add-on is listed in the outcome with its result in
  the three combinations walked, and every fix is named.
- `ui-conventions.md` describes themes and modes, and its checklist covers
  both.
- Typecheck, lint, and the tests of the touched packages pass. The full
  cross-workspace suite and long e2e runs are not part of this brief.
- Owner steps in the outcome: deploy 08-15 together, retake the docs
  screenshots (`docs/images/shots.md`), and re-vendor the kit in
  imbatranim-office and Hollow.

## Files you OWN

- Any app or add-on file, for theme fixes only.
- `corpus/wiki/ui-conventions.md`, `corpus/wiki/status.md`, `corpus/log.md`.
- The comment block at the top of the tokens in `apps/core/src/index.css`.
