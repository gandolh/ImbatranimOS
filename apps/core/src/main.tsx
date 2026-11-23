// First, before any other module (and so before any app's): core keeps the
// page's network primitives as they are now, for the calls that carry an
// app's token.
import { required } from "./shared/lib/required";
import "./system/network";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion } from "framer-motion";
import { queryClient } from "./lib/queryClient";
import "./index.css";
import { App } from "./App.tsx";
import { AuthGate } from "./modules/auth/AuthGate";
import { useAppearanceStore, applyAppearance } from "./shared/store/appearanceStore";

// Brand the very first paint (the start-up and sign-in screens) with the
// persisted theme, mode and accent, before React mounts.
applyAppearance(useAppearanceStore.getState());

// The desktop animates with framer-motion's `m` components, whose features
// load here after the first paint, not in the first page load
// (`lib/motionFeatures.ts`). `strict` makes a full `motion.*` component throw,
// since one would bring the whole library back into the eager bundle.
const motionFeatures = () => import("./lib/motionFeatures").then((mod) => mod.domMax);

createRoot(required(document.getElementById("root"), "the root element")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={motionFeatures} strict>
        <AuthGate>
          <App />
        </AuthGate>
      </LazyMotion>
    </QueryClientProvider>
  </StrictMode>,
);
