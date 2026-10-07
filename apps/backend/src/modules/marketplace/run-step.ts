import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';

/** The most of a step's output kept for the build log. The end is what explains a failure. */
export const LOG_TAIL_BYTES = 64 * 1024;

export interface StepResult {
  ok: boolean;
  /** Why it failed, in a sentence, when it did. */
  reason?: string;
  /** It failed because it ran past its deadline. A URL check answers 504 for that. */
  timedOut?: boolean;
  /**
   * `onStdout` said to stop, so the command was killed on purpose. That is
   * not a failure: `ok` is true, and the caller knows why it stopped.
   */
  stopped?: boolean;
  /**
   * The last {@link LOG_TAIL_BYTES} of stdout and stderr, interleaved; of
   * stderr only when `onStdout` takes stdout.
   */
  output: string;
}

export interface StepOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  /**
   * Read stdout as it comes instead of keeping its tail, for output too big
   * to hold (a URL check's `git ls-tree` and `git ls-remote`, brief 158).
   * Returning false stops the command: it is killed, and the result says
   * `stopped`.
   */
  onStdout?: (chunk: Buffer) => boolean;
}

/**
 * Run one install or build command (brief 120): an argv, no shell, with a
 * deadline and a bounded log.
 *
 * The child gets its own process group, so a timeout kills everything the
 * build started (`npm` → `node` → `esbuild` …), not just the top process.
 * Output is kept as a rolling tail: a chatty build cannot fill memory.
 */
export function runStep(
  command: readonly string[],
  options: StepOptions,
): Promise<StepResult> {
  return new Promise((resolve) => {
    let tail = Buffer.alloc(0);
    const keep = (chunk: Buffer) => {
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > LOG_TAIL_BYTES) {
        tail = tail.subarray(tail.length - LOG_TAIL_BYTES);
      }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd: options.cwd,
        env: options.env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ ok: false, reason: (err as Error).message, output: '' });
      return;
    }
    let timedOut = false;
    let stopped = false;
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    };
    const { onStdout } = options;
    child.stdout?.on(
      'data',
      onStdout
        ? (chunk: Buffer) => {
            if (stopped) return;
            if (!onStdout(chunk)) {
              stopped = true;
              killGroup();
            }
          }
        : keep,
    );
    child.stderr?.on('data', keep);
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, options.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        reason: err.message,
        output: tail.toString('utf8'),
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // A build that left background children behind does not keep them.
      killGroup();
      const output = tail.toString('utf8');
      if (stopped) {
        resolve({ ok: true, stopped: true, output });
      } else if (timedOut) {
        resolve({
          ok: false,
          timedOut: true,
          reason: `${command.join(' ')} took longer than ${Math.round(options.timeoutMs / 1000)} s`,
          output,
        });
      } else if (code === 0) {
        resolve({ ok: true, output });
      } else {
        resolve({
          ok: false,
          reason: `${command.join(' ')} exited with ${code ?? signal}`,
          output,
        });
      }
    });
  });
}

/** The most characters one line of {@link eachLine}'s input may hold. A ref line is far shorter. */
export const MAX_LINE_LENGTH = 64 * 1024;

/**
 * An `onStdout` that hands each complete line (UTF-8, without its `\n`) to
 * `onLine`. A line longer than {@link MAX_LINE_LENGTH} stops the command.
 * Call the returned `end` after the command, for a last line with no `\n`.
 */
export function eachLine(onLine: (line: string) => void): {
  onStdout: (chunk: Buffer) => boolean;
  end: () => void;
} {
  // `partial` is checked on every chunk, so it never grows past one chunk
  // beyond the limit.
  const decoder = new StringDecoder('utf8');
  let partial = '';
  return {
    onStdout: (chunk) => {
      const lines = (partial + decoder.write(chunk)).split('\n');
      partial = lines.pop()!;
      for (const line of lines) onLine(line);
      return partial.length <= MAX_LINE_LENGTH;
    },
    end: () => {
      const last = partial + decoder.end();
      partial = '';
      if (last !== '') onLine(last);
    },
  };
}
