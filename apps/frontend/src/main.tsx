import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './modules/auth/AuthGate'
import { useAppearanceStore, applyAppearance } from './shared/store/appearanceStore'

// Brand the very first paint (lock screen / first-run wizard) with the
// persisted theme + accent, before React mounts.
{
  const { theme, accent } = useAppearanceStore.getState()
  applyAppearance(theme, accent)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>
)
