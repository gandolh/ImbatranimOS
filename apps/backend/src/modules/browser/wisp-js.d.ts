/**
 * The slice of `@mercuryworkshop/wisp-js/server` the Browser relay uses. The
 * package ships no types.
 */
declare module '@mercuryworkshop/wisp-js/server' {
  import type { WebSocket } from 'ws';

  interface WispSocketClass {
    new (
      hostname: string,
      port: number,
    ): {
      connect(): Promise<void>;
      recv(): Promise<Uint8Array | null>;
      send(data: Uint8Array): Promise<void>;
      close(): Promise<void>;
      pause(): void;
      resume(): void;
    };
  }

  export const server: {
    ServerConnection: new (
      ws: WebSocket,
      path: string,
      options: {
        TCPSocket?: WispSocketClass;
        UDPSocket?: WispSocketClass;
        wisp_version?: 1 | 2;
      },
    ) => { setup(): Promise<void>; run(): Promise<void> };
    options: {
      allow_udp_streams: boolean;
      allow_direct_ip: boolean;
      allow_private_ips: boolean;
      allow_loopback_ips: boolean;
      stream_limit_total: number;
      stream_limit_per_host: number;
      port_whitelist: (number | [number, number])[] | null;
      parse_real_ip: boolean;
      wisp_version: 1 | 2;
    };
  };

  export const logging: {
    ERROR: number;
    WARN: number;
    set_level(level: number): void;
  };
}

/** epoxy-transport's Node entry: where its browser build lives. */
declare module '@mercuryworkshop/epoxy-transport' {
  export const epoxyPath: string;
}
