import { PtySession, type PtyLike, type SocketLike } from './pty-session';

const WS_OPEN = 1;
const WS_CLOSED = 3;

function makeFakePty() {
  const listeners: {
    data: ((d: string) => void)[];
    exit: ((e: { exitCode: number; signal?: number }) => void)[];
  } = { data: [], exit: [] };
  const disposed = { data: false, exit: false };
  const pty: PtyLike & {
    emitData(d: string): void;
    emitExit(code: number): void;
    write: jest.Mock;
    resize: jest.Mock;
    kill: jest.Mock;
    pause: jest.Mock;
    resume: jest.Mock;
  } = {
    onData(cb) {
      listeners.data.push(cb);
      return { dispose: () => (disposed.data = true) };
    },
    onExit(cb) {
      listeners.exit.push(cb);
      return { dispose: () => (disposed.exit = true) };
    },
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    emitData: (d) => listeners.data.forEach((cb) => cb(d)),
    emitExit: (code) => listeners.exit.forEach((cb) => cb({ exitCode: code })),
  };
  return pty;
}

function makeFakeSocket() {
  const handlers: Record<string, ((...a: any[]) => void)[]> = {};
  const socket: SocketLike & {
    bufferedAmount: number;
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
    emit(event: string, ...args: any[]): void;
  } = {
    bufferedAmount: 0,
    readyState: WS_OPEN,
    send: jest.fn(),
    close: jest.fn(),
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
    },
    emit(event, ...args) {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  return socket;
}

describe('PtySession', () => {
  let pty: ReturnType<typeof makeFakePty>;
  let socket: ReturnType<typeof makeFakeSocket>;

  beforeEach(() => {
    pty = makeFakePty();
    socket = makeFakeSocket();
  });

  it('forwards pty output to the socket', () => {
    new PtySession(pty, socket);
    pty.emitData('hello');
    expect(socket.send).toHaveBeenCalledWith('hello');
  });

  it('writes client input frames to the pty', () => {
    new PtySession(pty, socket);
    socket.emit('message', JSON.stringify({ type: 'input', data: 'ls\r' }));
    expect(pty.write).toHaveBeenCalledWith('ls\r');
  });

  it('accepts Buffer message frames', () => {
    new PtySession(pty, socket);
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'input', data: 'x' })));
    expect(pty.write).toHaveBeenCalledWith('x');
  });

  it('resizes the pty (SIGWINCH) on a resize frame', () => {
    new PtySession(pty, socket);
    socket.emit('message', JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    expect(pty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('ignores malformed / unknown frames without throwing', () => {
    new PtySession(pty, socket);
    socket.emit('message', 'not json');
    socket.emit('message', JSON.stringify({ type: 'bogus' }));
    socket.emit('message', JSON.stringify({ type: 'input' })); // missing data
    socket.emit('message', JSON.stringify({ type: 'resize', cols: 'x', rows: 1 }));
    expect(pty.write).not.toHaveBeenCalled();
    expect(pty.resize).not.toHaveBeenCalled();
  });

  it('kills the pty when the socket closes (window closed)', () => {
    new PtySession(pty, socket);
    socket.emit('close');
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it('notifies and closes the socket when the pty exits', () => {
    new PtySession(pty, socket);
    pty.emitExit(0);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('process exited'));
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('reaps the pty exactly once even across multiple teardowns', () => {
    const s = new PtySession(pty, socket);
    socket.emit('close');
    s.dispose();
    pty.emitExit(0);
    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(s.isDisposed).toBe(true);
  });

  it('does not send after the socket is no longer open', () => {
    new PtySession(pty, socket);
    socket.readyState = WS_CLOSED;
    pty.emitData('late');
    expect(socket.send).not.toHaveBeenCalled();
  });

  describe('backpressure', () => {
    it('pauses the pty when the send buffer is congested and resumes on drain', () => {
      let drainFn: (() => void) | null = null;
      const setIntervalFn = jest.fn((fn: () => void) => {
        drainFn = fn;
        return 1;
      });
      const clearIntervalFn = jest.fn();
      new PtySession(pty, socket, {
        highWater: 100,
        lowWater: 10,
        setIntervalFn,
        clearIntervalFn,
      });

      socket.bufferedAmount = 200; // above high water
      pty.emitData('flood');
      expect(pty.pause).toHaveBeenCalledTimes(1);
      expect(setIntervalFn).toHaveBeenCalledTimes(1);

      // Still congested → no resume yet.
      drainFn!();
      expect(pty.resume).not.toHaveBeenCalled();

      // Drained → resume and stop polling.
      socket.bufferedAmount = 5;
      drainFn!();
      expect(pty.resume).toHaveBeenCalledTimes(1);
      expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    });

    it('does not pause when the buffer stays below high water', () => {
      new PtySession(pty, socket, { highWater: 100, lowWater: 10 });
      socket.bufferedAmount = 50;
      pty.emitData('ok');
      expect(pty.pause).not.toHaveBeenCalled();
    });
  });
});
