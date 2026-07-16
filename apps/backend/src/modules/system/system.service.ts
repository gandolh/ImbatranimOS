import { Injectable } from '@nestjs/common';
import * as os from 'os';

export type SystemStats = {
  cpu: number;
  ramUsedGb: number;
  ramTotalGb: number;
};

@Injectable()
export class SystemService {
  async getStats(): Promise<SystemStats> {
    const cpu = await this.getCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      cpu,
      ramUsedGb: Math.round(((totalMem - freeMem) / 1e9) * 10) / 10,
      ramTotalGb: Math.round((totalMem / 1e9) * 10) / 10,
    };
  }

  private getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const before = this.sampleCpus();

      setTimeout(() => {
        const after = this.sampleCpus();
        let totalIdle = 0;
        let totalTick = 0;

        for (let i = 0; i < before.length; i++) {
          const idleDiff = after[i].idle - before[i].idle;
          const totalDiff = after[i].total - before[i].total;
          totalIdle += idleDiff;
          totalTick += totalDiff;
        }

        const usage = totalTick === 0 ? 0 : ((totalTick - totalIdle) / totalTick) * 100;
        resolve(Math.round(usage * 10) / 10);
      }, 100);
    });
  }

  private sampleCpus(): Array<{ idle: number; total: number }> {
    return os.cpus().map((cpu) => {
      const times = cpu.times;
      const total = times.user + times.nice + times.sys + times.idle + times.irq;
      return { idle: times.idle, total };
    });
  }
}
