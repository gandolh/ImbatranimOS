import { eachLine, LOG_TAIL_BYTES, MAX_LINE_LENGTH, runStep } from './run-step';

const env = { PATH: process.env.PATH };

describe('runStep (brief 120)', () => {
  it('runs an argv with no shell', async () => {
    const r = await runStep(
      ['node', '-e', 'console.log(process.argv[1])', '$(id); echo hi'],
      {
        cwd: process.cwd(),
        env,
        timeoutMs: 10_000,
      },
    );
    expect(r.ok).toBe(true);
    expect(r.output.trim()).toBe('$(id); echo hi');
  });

  it('reports the exit code', async () => {
    const r = await runStep(['node', '-e', 'process.exit(7)'], {
      cwd: process.cwd(),
      env,
      timeoutMs: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exited with 7$/);
  });

  it('reports a command that does not exist', async () => {
    const r = await runStep(['no-such-command-here'], {
      cwd: process.cwd(),
      env,
      timeoutMs: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ENOENT/);
  });

  it('kills the whole process group at the deadline', async () => {
    const started = Date.now();
    // A child that would outlive its parent if only the parent were killed.
    const r = await runStep(['sh', '-c', 'sleep 30 & sleep 30'], {
      cwd: process.cwd(),
      env,
      timeoutMs: 300,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/took longer than/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('keeps only the tail of a chatty build', async () => {
    const r = await runStep(
      [
        'node',
        '-e',
        `process.stdout.write('x'.repeat(${LOG_TAIL_BYTES * 3}) + 'END')`,
      ],
      { cwd: process.cwd(), env, timeoutMs: 10_000 },
    );
    expect(r.ok).toBe(true);
    expect(r.output.length).toBe(LOG_TAIL_BYTES);
    expect(r.output.endsWith('END')).toBe(true);
  });

  it('hands stdout to onStdout as it comes, and keeps only stderr', async () => {
    const chunks: Buffer[] = [];
    const r = await runStep(
      [
        'node',
        '-e',
        "process.stdout.write('out'); process.stderr.write('err')",
      ],
      {
        cwd: process.cwd(),
        env,
        timeoutMs: 10_000,
        onStdout: (chunk) => {
          chunks.push(chunk);
          return true;
        },
      },
    );
    expect(r).toEqual({ ok: true, output: 'err' });
    expect(Buffer.concat(chunks).toString()).toBe('out');
  });

  it('stops the command, whole group, when onStdout says so', async () => {
    const started = Date.now();
    let seen = 0;
    const r = await runStep(
      ['sh', '-c', 'sleep 30 & while true; do echo line; sleep 0.01; done'],
      {
        cwd: process.cwd(),
        env,
        timeoutMs: 20_000,
        onStdout: () => ++seen < 3,
      },
    );
    expect(r).toMatchObject({ ok: true, stopped: true });
    expect(seen).toBe(3);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('eachLine (brief 158)', () => {
  it('splits chunks into lines, across chunk and UTF-8 boundaries', () => {
    const lines: string[] = [];
    const split = eachLine((line) => lines.push(line));
    const bytes = Buffer.from('a\tb\nfür\nlast', 'utf8');
    for (let i = 0; i < bytes.length; i++) {
      expect(split.onStdout(bytes.subarray(i, i + 1))).toBe(true);
    }
    expect(lines).toEqual(['a\tb', 'für']);
    split.end();
    expect(lines).toEqual(['a\tb', 'für', 'last']);
  });

  it('stops at a line longer than any ref line', () => {
    const split = eachLine(() => undefined);
    expect(split.onStdout(Buffer.from('x'.repeat(MAX_LINE_LENGTH)))).toBe(true);
    expect(split.onStdout(Buffer.from('x'))).toBe(false);
  });
});
