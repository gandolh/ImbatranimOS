import { LOG_TAIL_BYTES, runStep } from './run-step';

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
});
