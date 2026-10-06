import { spawn } from 'child_process';

/** The most of a step's output kept for the build log. The end is what explains a failure. */
export const LOG_TAIL_BYTES = 64 * 1024;

export interface StepResult {
  ok: boolean;
  /** Why it failed, in a sentence, when it did. */
  reason?: string;
  /** The last {@link LOG_TAIL_BYTES} of stdout and stderr, interleaved. */
  output: string;
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
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
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
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);

    let timedOut = false;
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    };
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
      if (timedOut) {
        resolve({
          ok: false,
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
