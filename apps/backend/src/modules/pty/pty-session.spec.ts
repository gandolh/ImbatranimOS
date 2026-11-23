import { PtySession, type PtyLike, type SocketLike } from "./pty-session";

const WS_OPEN = 1;
const WS_CLOSED = 3;

function makeFakePty() {
  const listeners: {
    data: ((d: string) => void)[];
    exit: ((e: { exitCode: number; signal?: number }) => void)[];
  } = { data: [], exit: [] };
  const disposed = { data: false, exit: false };
  const pty: Omit<PtyLike, "write" | "resize" | "kill" | "pause" | "resume"> & {
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
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const socket: Omit<SocketLike, "send" | "close" | "ping" | "terminate"> & {
    bufferedAmount: number;
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
    ping: jest.Mock;
    terminate: jest.Mock;
    emit(event: string, ...args: unknown[]): void;
  } = {
    bufferedAmount: 0,
    readyState: WS_OPEN,
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
    terminate: jest.fn(),
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
    },
    emit(event, ...args) {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  return socket;
}

describe("PtySession", () => {
  let pty: ReturnType<typeof makeFakePty>;
  let socket: ReturnType<typeof makeFakeSocket>;

  beforeEach(() => {
    pty = makeFakePty();
    socket = makeFakeSocket();
  });

  it("forwards pty output to the socket", () => {
    new PtySession(pty, socket);
    pty.emitData("hello");
    expect(socket.send).toHaveBeenCalledWith("hello");
  });

  it("writes client input frames to the pty", () => {
    new PtySession(pty, socket);
    socket.emit("message", JSON.stringify({ type: "input", data: "ls\r" }));
    expect(pty.write).toHaveBeenCalledWith("ls\r");
  });

  it("accepts Buffer message frames", () => {
    new PtySession(pty, socket);
    socket.emit("message", Buffer.from(JSON.stringify({ type: "input", data: "x" })));
    expect(pty.write).toHaveBeenCalledWith("x");
  });

  it("resizes the pty (SIGWINCH) on a resize frame", () => {
    new PtySession(pty, socket);
    socket.emit("message", JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
    expect(pty.resize).toHaveBeenCalledWith(120, 40);
  });

  it("ignores malformed / unknown frames without throwing", () => {
    new PtySession(pty, socket);
    socket.emit("message", "not json");
    socket.emit("message", JSON.stringify({ type: "bogus" }));
    socket.emit("message", JSON.stringify({ type: "input" })); // missing data
    socket.emit("message", JSON.stringify({ type: "resize", cols: "x", rows: 1 }));
    expect(pty.write).not.toHaveBeenCalled();
    expect(pty.resize).not.toHaveBeenCalled();
  });

  it("kills the pty when the tab says the window closed, then its socket closes", () => {
    new PtySession(pty, socket);
    socket.emit("message", JSON.stringify({ type: "close" }));
    expect(pty.kill).not.toHaveBeenCalled();
    socket.emit("close");
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it("kills the pty with its socket when no tab can come back to it", () => {
    new PtySession(pty, socket, { detachMs: 0 });
    socket.emit("close");
    expect(pty.kill).toHaveBeenCalledTimes(1);
  });

  it("notifies and closes the socket when the pty exits", () => {
    new PtySession(pty, socket);
    pty.emitExit(0);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining("process exited"));
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("reaps the pty exactly once even across multiple teardowns", () => {
    const s = new PtySession(pty, socket);
    socket.emit("message", JSON.stringify({ type: "close" }));
    socket.emit("close");
    s.dispose();
    pty.emitExit(0);
    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(s.isDisposed).toBe(true);
  });

  it("does not send after the socket is no longer open", () => {
    new PtySession(pty, socket);
    socket.readyState = WS_CLOSED;
    pty.emitData("late");
    expect(socket.send).not.toHaveBeenCalled();
  });

  describe("output that keeps coming", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("sends the first chunk at once and joins what follows within the window into one frame", () => {
      new PtySession(pty, socket, { joinMs: 5 });
      pty.emitData("a");
      expect(socket.send).toHaveBeenCalledWith("a");
      pty.emitData("b");
      pty.emitData("c");
      expect(socket.send).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(5);
      expect(socket.send).toHaveBeenLastCalledWith("bc");
      pty.emitData("d");
      jest.advanceTimersByTime(5);
      expect(socket.send.mock.calls).toEqual([["a"], ["bc"], ["d"]]);
    });

    it("sends the next chunk at once after a window with no output", () => {
      new PtySession(pty, socket, { joinMs: 5 });
      pty.emitData("a");
      jest.advanceTimersByTime(5);
      pty.emitData("b");
      expect(socket.send.mock.calls).toEqual([["a"], ["b"]]);
    });

    it("sends what is waiting before the exit notice", () => {
      new PtySession(pty, socket, { joinMs: 5 });
      pty.emitData("a");
      pty.emitData("last line");
      pty.emitExit(0);
      expect(socket.send).toHaveBeenNthCalledWith(2, "last line");
      expect(socket.send).toHaveBeenNthCalledWith(3, expect.stringContaining("process exited"));
    });

    it("sends every chunk on its own with a window of zero", () => {
      new PtySession(pty, socket, { joinMs: 0 });
      pty.emitData("a");
      pty.emitData("b");
      expect(socket.send.mock.calls).toEqual([["a"], ["b"]]);
    });
  });

  describe("backpressure", () => {
    it("pauses the pty when the send buffer is congested and resumes on drain", () => {
      let drainFn: (() => void) | null = null;
      const setIntervalFn = jest.fn((fn: () => void) => {
        drainFn = fn;
        return 1 as unknown as ReturnType<typeof setInterval>;
      });
      const clearIntervalFn = jest.fn();
      new PtySession(pty, socket, {
        highWater: 100,
        lowWater: 10,
        setIntervalFn,
        clearIntervalFn,
      });

      socket.bufferedAmount = 200; // above high water
      pty.emitData("flood");
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

    it("does not pause when the buffer stays below high water", () => {
      new PtySession(pty, socket, { highWater: 100, lowWater: 10 });
      socket.bufferedAmount = 50;
      pty.emitData("ok");
      expect(pty.pause).not.toHaveBeenCalled();
    });
  });

  describe("a socket that ends without the close frame", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("keeps the pty for 30 s, then hangs it up", () => {
      const onDispose = jest.fn();
      const s = new PtySession(pty, socket, { onDispose });
      socket.emit("close");
      expect(pty.kill).not.toHaveBeenCalled();
      expect(s.attached).toBe(false);
      jest.advanceTimersByTime(29_999);
      expect(pty.kill).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(pty.kill).toHaveBeenCalledTimes(1);
      expect(onDispose).toHaveBeenCalledTimes(1);
    });

    it("detaches on a socket error too", () => {
      new PtySession(pty, socket);
      socket.emit("error", new Error("reset"));
      expect(pty.kill).not.toHaveBeenCalled();
    });

    it("gives a new socket the same pty: a reset, the latest output, then live output", () => {
      const s = new PtySession(pty, socket);
      pty.emitData("before, ");
      socket.emit("close");
      pty.emitData("while ");
      pty.emitData("away");
      const next = makeFakeSocket();
      expect(s.attach(next)).toBe(true);
      expect(next.send).toHaveBeenCalledWith("\x1bcbefore, while away");
      pty.emitData("live");
      expect(next.send).toHaveBeenLastCalledWith("live");
      next.emit("message", JSON.stringify({ type: "input", data: "q" }));
      expect(pty.write).toHaveBeenCalledWith("q");
      jest.advanceTimersByTime(60_000);
      expect(pty.kill).not.toHaveBeenCalled();
    });

    it("keeps only the newest output past the ring's size", () => {
      const s = new PtySession(pty, socket, { ringBytes: 8 });
      socket.emit("close");
      pty.emitData("abcdef");
      pty.emitData("ghijkl");
      const next = makeFakeSocket();
      s.attach(next);
      expect(next.send).toHaveBeenCalledWith("\x1bcefghijkl");
    });

    it("starts the kept output at a line where the cut falls inside one", () => {
      const s = new PtySession(pty, socket, { ringBytes: 8 });
      socket.emit("close");
      pty.emitData("ab\ncd\nefgh");
      pty.emitData("ij");
      const next = makeFakeSocket();
      s.attach(next);
      expect(next.send).toHaveBeenCalledWith("\x1bcefghij");
    });

    it("resumes a paused pty, so a busy command keeps running while detached", () => {
      new PtySession(pty, socket, { highWater: 100, lowWater: 10 });
      socket.bufferedAmount = 200;
      pty.emitData("flood");
      expect(pty.pause).toHaveBeenCalledTimes(1);
      socket.emit("close");
      expect(pty.resume).toHaveBeenCalledTimes(1);
    });

    it("refuses a second socket while one is attached", () => {
      const s = new PtySession(pty, socket);
      expect(s.attach(makeFakeSocket())).toBe(false);
    });

    it("ignores the old socket's late events once a new one is attached", () => {
      const s = new PtySession(pty, socket);
      socket.emit("close");
      s.attach(makeFakeSocket());
      socket.emit("message", JSON.stringify({ type: "input", data: "stale" }));
      socket.emit("close");
      expect(pty.write).not.toHaveBeenCalled();
      expect(s.attached).toBe(true);
    });

    it("ends at once when the pty exits while detached", () => {
      const onDispose = jest.fn();
      const s = new PtySession(pty, socket, { onDispose });
      socket.emit("close");
      pty.emitExit(0);
      expect(s.isDisposed).toBe(true);
      expect(onDispose).toHaveBeenCalledTimes(1);
    });
  });

  describe("probe", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("answers true while the peer pongs", async () => {
      const s = new PtySession(pty, socket);
      const held = s.probe(2_000);
      expect(socket.ping).toHaveBeenCalledTimes(1);
      socket.emit("pong");
      await expect(held).resolves.toBe(true);
      expect(socket.terminate).not.toHaveBeenCalled();
    });

    it("answers false at once when the socket ends while it waits", async () => {
      const s = new PtySession(pty, socket);
      const held = s.probe(2_000);
      socket.emit("close");
      await expect(held).resolves.toBe(false);
      expect(s.attach(makeFakeSocket())).toBe(true);
    });

    it("drops a socket that doesn't answer and detaches the pty", async () => {
      const s = new PtySession(pty, socket);
      const held = s.probe(2_000);
      jest.advanceTimersByTime(2_000);
      await expect(held).resolves.toBe(false);
      expect(socket.terminate).toHaveBeenCalledTimes(1);
      expect(pty.kill).not.toHaveBeenCalled();
      expect(s.attach(makeFakeSocket())).toBe(true);
    });
  });
});
