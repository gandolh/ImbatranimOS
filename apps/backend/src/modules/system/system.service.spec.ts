import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SystemService } from './system.service';

describe('SystemService.killProcess (uid scoping)', () => {
  let service: SystemService;
  let killSpy: jest.SpyInstance;
  let getuidSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new SystemService();
    killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    getuidSpy = jest
      .spyOn(process, 'getuid' as never)
      .mockImplementation(() => 1000 as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signals a process owned by the same uid as the current process', async () => {
    jest.spyOn(service, 'getProcessUid').mockResolvedValue(1000);

    const result = await service.killProcess(4242);

    expect(result).toEqual({ pid: 4242, signaled: true });
    expect(killSpy).toHaveBeenCalledWith(4242, 'SIGTERM');
  });

  it('refuses (403) to signal a process owned by a different uid', async () => {
    jest.spyOn(service, 'getProcessUid').mockResolvedValue(0); // e.g. root-owned

    await expect(service.killProcess(1)).rejects.toThrow(ForbiddenException);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('never calls process.kill before the uid check resolves', async () => {
    let uidChecked = false;
    jest.spyOn(service, 'getProcessUid').mockImplementation(() => {
      uidChecked = true;
      return Promise.resolve(1000);
    });
    killSpy.mockImplementation(() => {
      expect(uidChecked).toBe(true);
      return true;
    });

    await service.killProcess(4242);
    expect(killSpy).toHaveBeenCalled();
  });

  it('translates a missing pid (ESRCH from getProcessUid) to 404', async () => {
    jest
      .spyOn(service, 'getProcessUid')
      .mockRejectedValue(new NotFoundException('No such process: 99999'));

    await expect(service.killProcess(99999)).rejects.toThrow(NotFoundException);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('translates an ESRCH error from process.kill itself to 404', async () => {
    jest.spyOn(service, 'getProcessUid').mockResolvedValue(1000);
    killSpy.mockImplementation(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    await expect(service.killProcess(4242)).rejects.toThrow(NotFoundException);
  });

  it('falls back to uid 0 when process.getuid is unavailable (non-POSIX)', async () => {
    getuidSpy.mockRestore();
    Object.defineProperty(process, 'getuid', {
      value: undefined,
      configurable: true,
    });
    jest.spyOn(service, 'getProcessUid').mockResolvedValue(0);

    const result = await service.killProcess(4242);
    expect(result.signaled).toBe(true);
  });
});

describe('SystemService.getProcessUid (real /proc read)', () => {
  it('reads the uid of the current test process from /proc/self equivalent', async () => {
    // Not mocked here: exercises the real /proc/<pid>/status parser against
    // this Jest process itself, which is guaranteed to exist and be owned
    // by the current uid — a real (non-simulated) sanity check.
    const service = new SystemService();
    const ownUid = typeof process.getuid === 'function' ? process.getuid() : 0;
    const uid = await service.getProcessUid(process.pid);
    expect(uid).toBe(ownUid);
  });

  it('throws NotFoundException for a pid that does not exist', async () => {
    const service = new SystemService();
    // PID 4-billion-ish is never valid; guaranteed to miss /proc.
    await expect(service.getProcessUid(999999999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
