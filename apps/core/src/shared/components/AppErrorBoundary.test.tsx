// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'
import { notify } from '../store/notificationStore'

vi.mock('../store/notificationStore', () => ({
  notify: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.mocked(notify).mockClear()
})

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom')
  }
  return <div>content ok</div>
}

/** Mirrors how Window.tsx keys the boundary: bumping remounts it fresh. */
function Harness({ shouldThrow }: { shouldThrow: boolean }) {
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <AppErrorBoundary
      key={reloadKey}
      appId="test-app"
      appName="Test App"
      onReload={() => setReloadKey((k) => k + 1)}
      onClose={() => {}}
    >
      <Bomb shouldThrow={shouldThrow} />
    </AppErrorBoundary>
  )
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error to console.error; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders the fallback instead of letting the throw propagate', () => {
    render(<Harness shouldThrow={true} />)

    expect(screen.getByText('Test App crashed')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
    expect(screen.queryByText('content ok')).toBeNull()
  })

  it('does not affect a sibling tree rendered alongside it', () => {
    render(
      <div>
        <Harness shouldThrow={true} />
        <div>unaffected sibling</div>
      </div>
    )

    expect(screen.getByText('Test App crashed')).toBeTruthy()
    expect(screen.getByText('unaffected sibling')).toBeTruthy()
  })

  it('remounts the child and clears the error state on Reload', () => {
    function Controlled() {
      const [broken, setBroken] = useState(true)
      const [reloadKey, setReloadKey] = useState(0)
      return (
        <AppErrorBoundary
          key={reloadKey}
          appId="test-app"
          appName="Test App"
          onReload={() => {
            setBroken(false)
            setReloadKey((k) => k + 1)
          }}
          onClose={() => {}}
        >
          <Bomb shouldThrow={broken} />
        </AppErrorBoundary>
      )
    }

    render(<Controlled />)
    expect(screen.getByText('Test App crashed')).toBeTruthy()

    fireEvent.click(screen.getByText('Reload'))

    expect(screen.queryByText('Test App crashed')).toBeNull()
    expect(screen.getByText('content ok')).toBeTruthy()
  })

  it('calls the onClose prop when Close window is clicked', () => {
    const onClose = vi.fn()
    render(
      <AppErrorBoundary appId="test-app" appName="Test App" onReload={() => {}} onClose={onClose}>
        <Bomb shouldThrow={true} />
      </AppErrorBoundary>
    )

    fireEvent.click(screen.getByText('Close window'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('emits exactly one deduplicated error notification per crash', () => {
    const { rerender } = render(<Harness shouldThrow={true} />)
    // A re-render of the already-crashed tree must not re-trigger componentDidCatch;
    // this guards against notification spam on a render loop.
    rerender(<Harness shouldThrow={true} />)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test App crashed', level: 'error', appId: 'test-app' })
    )
  })
})
