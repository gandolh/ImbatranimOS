import { Component, type ErrorInfo, type ReactNode } from 'react'
import { notify } from '../store/notificationStore'
import { AppErrorFallback } from './AppErrorFallback'

type AppErrorBoundaryProps = {
  appId: string
  appName: string
  onReload: () => void
  onClose: () => void
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

/**
 * Per-window error boundary. Catches an uncaught render/effect throw from a
 * single app so it collapses only that window into a recoverable in-chrome
 * panel — the rest of the desktop (other windows, chrome, taskbar) is
 * unaffected. Wrap app content only, never the window chrome.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  // Guards against notification spam on a render loop — only the first throw
  // per error-state entry raises a notification.
  private notified = false

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    if (this.notified) return
    this.notified = true
    notify({
      title: `${this.props.appName} crashed`,
      body: error.message,
      appId: this.props.appId,
      level: 'error',
    })
  }

  handleReload = (): void => {
    this.notified = false
    this.setState({ error: null })
    this.props.onReload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <AppErrorFallback
          appName={this.props.appName}
          error={this.state.error}
          onReload={this.handleReload}
          onClose={this.props.onClose}
        />
      )
    }
    return this.props.children
  }
}
