# Brief 10 — Selection fills use the soft accent

## Context

Brief 09 gave every accent a strong pair (`primary` / `on-primary`) and a
soft pair (`primary-container` / `on-primary-container`). In Apricot, strong
is a deep shade with white on it and soft is the pastel with dark text. In
Classic the two are the same. On the canvas the owner picked
([Desktop.dc.html](../../wiki/assets/themes-2026-11/Desktop.dc.html)), the
*selected and current* things are pastel:
- the selected file row;
- the current folder in the tree;
- the active toolbar tab;
- the Settings section rail;
- the chosen option in a segmented control.

Today they are all `bg-primary text-on-primary`, which after 09 would be
terracotta in Apricot.

**The rule** (goes into [ui-conventions.md](../../wiki/ui-conventions.md)):
- A selected, current or chosen state is `bg-primary-container
  text-on-primary-container`.
- A primary action (Install, Save, OK), a progress bar, an unread badge and a
  thin indicator stay `bg-primary text-on-primary` or `bg-primary`.
- Text, focus rings and borders stay `primary`.

Independent of 01-06; ships together with 08-15.

## Spec

1. List every `bg-primary` use in `apps/core/src`, `apps/add-ons` and
   `packages/ui/src`: about 84 in 57 files, as of 2026-11-02. Sort each into
   *selection* or *action/indicator*, and put the list in the outcome.
2. Move the selection ones to `bg-primary-container`, and their text and icons
   to `text-on-primary-container`. Check hover and focus states on the same
   elements: a hover that darkens a selected row must still read.
3. Surfaces that must match the canvas, checked one by one in Apricot light:
   - File Manager: the selected row, the current folder, the active
     Home/Notes tab;
   - Settings: the section rail and the segmented controls;
   - the Start menu's highlighted item;
   - the kit's `Select`, `ContextMenu` and `Checkbox` checked/selected states.
4. Add the rule to `ui-conventions.md` beside the token rules (§5-6), with one
   example of each kind.

## Must preserve

- Classic, pixel for pixel: there the two pairs are equal, so the swap shows
  nothing.
- No new token names; no hex literals.

## Acceptance

- In Apricot light, each surface in step 3 shows the pastel with dark text,
  and primary actions keep the deep fill with white text.
- Classic light and dark screenshots of the same surfaces are unchanged.
- Typecheck, lint, and the tests of the touched add-ons pass.
- The outcome has the sorted list.

## Files you OWN

- The files the `bg-primary` list names, for those class changes only.
- `corpus/wiki/ui-conventions.md`: the new rule.
- `corpus/wiki/status.md`, `corpus/log.md`.
