import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
// execa ships pure ESM; import it lazily (dynamic import) so this module
// still loads under ts-jest's CommonJS transform in unit tests.
type ExecaFn = typeof import('execa').execa;
let execaFn: ExecaFn | null = null;
async function getExeca(): Promise<ExecaFn> {
  if (!execaFn) {
    ({ execa: execaFn } = await import('execa'));
  }
  return execaFn;
}

export type CpuStats = {
  percent: number;
  cores: number;
};

export type MemoryStats = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  percent: number;
};

export type DiskStats = {
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percent: number;
};

export type SystemStats = {
  cpu: CpuStats;
  memory: MemoryStats;
  disk: DiskStats;
};

export type ProcessInfo = {
  pid: number;
  uid: number;
  name: string;
  cpuPercent: number;
  memPercent: number;
  memBytes: number;
};

export type AboutInfo = {
  hostname: string;
  kernel: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  imageVersion: string;
};

type CpuSample = { idle: number; total: number };

const ALLOWED_KILL_SIGNALS: NodeJS.Signals[] = [
  'SIGTERM',
  'SIGKILL',
  'SIGINT',
  'SIGHUP',
];

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  // Small CPU-delta cache: each stats() call samples os.cpus() once and
  // diffs against the previous call's sample, instead of blocking the
  // request with an internal setTimeout. Cheap and stateless per-request.
  private lastCpuSample: CpuSample[] | null = null;
  private lastCpuPercent = 0;

  async getStats(): Promise<SystemStats> {
    const [cpu, memory, disk] = await Promise.all([
      Promise.resolve(this.getCpuStats()),
      this.getMemoryStats(),
      this.getDiskStats(),
    ]);
    return { cpu, memory, disk };
  }

  private getCpuStats(): CpuStats {
    const samples = this.sampleCpus();
    let percent = this.lastCpuPercent;

    if (this.lastCpuSample && this.lastCpuSample.length === samples.length) {
      let totalIdle = 0;
      let totalTick = 0;
      for (let i = 0; i < samples.length; i++) {
        totalIdle += samples[i].idle - this.lastCpuSample[i].idle;
        totalTick += samples[i].total - this.lastCpuSample[i].total;
      }
      percent =
        totalTick <= 0
          ? this.lastCpuPercent
          : Math.round(((totalTick - totalIdle) / totalTick) * 1000) / 10;
    }

    this.lastCpuSample = samples;
    this.lastCpuPercent = percent;
    return { percent, cores: samples.length };
  }

  private sampleCpus(): CpuSample[] {
    return os.cpus().map((cpu) => {
      const t = cpu.times;
      return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
    });
  }

  private async getMemoryStats(): Promise<MemoryStats> {
    try {
      const raw = await fsp.readFile('/proc/meminfo', 'utf8');
      const kv: Record<string, number> = {};
      for (const line of raw.split('\n')) {
        const m = line.match(/^(\w+):\s+(\d+)\s*kB/);
        if (m) kv[m[1]] = Number(m[2]) * 1024;
      }
      const totalBytes = kv.MemTotal ?? os.totalmem();
      // MemAvailable accounts for reclaimable cache/buffers, unlike freemem().
      const availableBytes = kv.MemAvailable ?? os.freemem();
      return this.toMemoryStats(totalBytes, availableBytes);
    } catch (err) {
      this.logger.warn(
        `/proc/meminfo unavailable, falling back to os module: ${(err as Error).message}`,
      );
      return this.toMemoryStats(os.totalmem(), os.freemem());
    }
  }

  private toMemoryStats(
    totalBytes: number,
    availableBytes: number,
  ): MemoryStats {
    const usedBytes = Math.max(totalBytes - availableBytes, 0);
    const percent =
      totalBytes === 0 ? 0 : Math.round((usedBytes / totalBytes) * 1000) / 10;
    return { totalBytes, usedBytes, availableBytes, percent };
  }

  private async getDiskStats(): Promise<DiskStats> {
    const target = os.homedir();
    try {
      const stats = await fsp.statfs(target);
      const totalBytes = stats.blocks * stats.bsize;
      // bavail (not bfree) is what's actually usable by an unprivileged
      // user, matching what `df` reports for a non-root caller.
      const freeBytes = stats.bavail * stats.bsize;
      const usedBytes = Math.max(totalBytes - freeBytes, 0);
      const percent =
        totalBytes === 0 ? 0 : Math.round((usedBytes / totalBytes) * 1000) / 10;
      return { path: target, totalBytes, usedBytes, freeBytes, percent };
    } catch (err) {
      this.logger.warn(
        `statfs failed for ${target}: ${(err as Error).message}`,
      );
      return {
        path: target,
        totalBytes: 0,
        usedBytes: 0,
        freeBytes: 0,
        percent: 0,
      };
    }
  }

  async getProcesses(): Promise<ProcessInfo[]> {
    try {
      const execa = await getExeca();
      const { stdout } = await execa('ps', [
        '-eo',
        'pid,ruid,pcpu,pmem,rss,comm',
        '--no-headers',
      ]);
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [pid, uid, pcpu, pmem, rss, ...nameParts] = line.split(/\s+/);
          return {
            pid: Number(pid),
            uid: Number(uid),
            cpuPercent: Number(pcpu),
            memPercent: Number(pmem),
            memBytes: Number(rss) * 1024,
            name: nameParts.join(' '),
          };
        })
        .sort((a, b) => b.cpuPercent - a.cpuPercent);
    } catch (err) {
      this.logger.error(`ps failed: ${(err as Error).message}`);
      return [];
    }
  }

  getAbout(): Promise<AboutInfo> {
    return Promise.resolve({
      hostname: os.hostname(),
      kernel: os.release(),
      platform: os.platform(),
      arch: os.arch(),
      uptimeSeconds: Math.round(os.uptime()),
      imageVersion: this.getImageVersion(),
    });
  }

  private getImageVersion(): string {
    if (process.env.IMAGE_VERSION) return process.env.IMAGE_VERSION;
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
        version?: string;
      };
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async killProcess(
    pid: number,
    signal: NodeJS.Signals = 'SIGTERM',
  ): Promise<{ pid: number; signaled: boolean }> {
    const safeSignal = ALLOWED_KILL_SIGNALS.includes(signal)
      ? signal
      : 'SIGTERM';
    const targetUid = await this.getProcessUid(pid);
    const ownUid = typeof process.getuid === 'function' ? process.getuid() : 0;

    if (targetUid !== ownUid) {
      throw new ForbiddenException(
        `Refusing to signal pid ${pid}: owned by a different user`,
      );
    }

    try {
      process.kill(pid, safeSignal);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ESRCH')
        throw new NotFoundException(`No such process: ${pid}`);
      throw err;
    }

    return { pid, signaled: true };
  }

  // Reads the real UID of `pid` from /proc/<pid>/status. Exposed (not
  // private) so unit tests can stub it directly when exercising the
  // ownership-scoping logic in killProcess().
  async getProcessUid(pid: number): Promise<number> {
    let raw: string;
    try {
      raw = await fsp.readFile(`/proc/${pid}/status`, 'utf8');
    } catch {
      throw new NotFoundException(`No such process: ${pid}`);
    }
    // Uid line: "Uid:\t<real>\t<effective>\t<saved>\t<fs>"
    const match = raw.match(/^Uid:\s+(\d+)/m);
    if (!match) {
      throw new NotFoundException(`Could not determine owner for pid ${pid}`);
    }
    return Number(match[1]);
  }
}
