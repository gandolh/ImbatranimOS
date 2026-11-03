import { useEffect } from 'react'
import { LinuxWindowsConnection } from './connection'
import { LinuxPopupLayer } from './LinuxPopupLayer'

/**
 * Mounted once by the desktop, which only renders once signed in: opens this
 * tab's Linux windows socket and closes it on sign-out or unload, and draws
 * the session's popups above every window.
 */
export function LinuxWindowsService() {
  useEffect(() => {
    const connection = new LinuxWindowsConnection()
    connection.start()
    return () => connection.stop()
  }, [])
  return <LinuxPopupLayer />
}
