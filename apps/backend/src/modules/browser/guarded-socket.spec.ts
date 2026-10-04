import { createServer, type Server } from 'net';

import { EgressRefusedError } from './egress';
import { GuardedTcpSocket, RefusedUdpSocket } from './guarded-socket';

describe('GuardedTcpSocket (brief 50)', () => {
  let server: Server;
  let connections = 0;

  beforeAll(async () => {
    server = createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('never dials a refused destination', async () => {
    for (const host of ['127.0.0.1', '::ffff:127.0.0.1', 'localhost']) {
      const socket = new GuardedTcpSocket(host, 80);
      await expect(socket.connect()).rejects.toBeInstanceOf(EgressRefusedError);
    }
    expect(connections).toBe(0);
  });

  it('never dials a listening local service on a port that is not a web port', async () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const socket = new GuardedTcpSocket('127.0.0.1', port);
    await expect(socket.connect()).rejects.toBeInstanceOf(EgressRefusedError);
    expect(connections).toBe(0);
  });

  it('reads nothing and closes cleanly when it never connected', async () => {
    const socket = new GuardedTcpSocket('127.0.0.1', 80);
    await socket.close();
    await expect(socket.recv()).resolves.toBeNull();
  });

  it('has no UDP', async () => {
    await expect(
      new RefusedUdpSocket('8.8.8.8', 53).connect(),
    ).rejects.toThrow();
  });
});
