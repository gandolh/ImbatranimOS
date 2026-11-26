import { useEffect } from "react";
import type { LinuxWindowsConnection } from "./connection";
import { LinuxPopupLayer } from "./LinuxPopupLayer";
import { reloadLinuxLaunchers } from "./launchers";

/** How long to wait before asking again for the socket's chunk when it did not arrive. */
const CHUNK_RETRY_MS = 5_000;

/**
 * Mounted once by the desktop, which only renders once signed in: opens this
 * tab's Linux windows socket and closes it on sign-out or unload, and draws
 * the session's popups above every window.
 *
 * The socket's code (its frame decoding, sound and notifications) is a chunk
 * of its own, fetched once the desktop has mounted, so the first page load
 * does not carry it.
 */
export function LinuxWindowsService() {
  useEffect(() => {
    let stopped = false;
    let connection: LinuxWindowsConnection | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      void import("./connection").then(
        ({ LinuxWindowsConnection }) => {
          if (stopped) return;
          connection = new LinuxWindowsConnection();
          connection.start();
        },
        () => {
          // The chunk did not arrive (the network, or a deploy in between): try again.
          if (!stopped) retry = setTimeout(connect, CHUNK_RETRY_MS);
        },
      );
    };
    connect();
    void reloadLinuxLaunchers();
    return () => {
      stopped = true;
      if (retry !== undefined) clearTimeout(retry);
      connection?.stop();
    };
  }, []);
  return <LinuxPopupLayer />;
}
