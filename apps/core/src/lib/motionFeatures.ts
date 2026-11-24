/**
 * framer-motion's animation, gesture, drag and layout code, the part of the
 * library the desktop's `m.div`s run on. A module of its own so `main.tsx`
 * loads it with a dynamic import: it is most of the library (about 120 KiB
 * minified), and keeping it out of the first page load lets the sign-in
 * screen paint before it arrives. `domMax`, not `domAnimation`, because a
 * desktop icon is dragged.
 */
export { domMax } from "framer-motion";
