// First, before any other module (and so before any app's): core keeps the
// page's network primitives as they are now, for the calls that carry an
// app's token.
import "./system/network";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import "./index.css";
import App from "./App.tsx";
import { AuthGate } from "./modules/auth/AuthGate";
import { useAppearanceStore, applyAppearance } from "./shared/store/appearanceStore";

// Brand the very first paint (the start-up and sign-in screens) with the
// persisted theme, mode and accent, before React mounts.
applyAppearance(useAppearanceStore.getState());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
