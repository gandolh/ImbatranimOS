import { Injectable, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { resolve, join, isAbsolute } from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as pty from 'node-pty';

export interface ServiceConfig {
  id: string;
  name: string;
  command: string;
  cwd: string;
  icon?: string;
}

export enum ServiceStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
}

export interface ServiceInfo extends ServiceConfig {
  status: ServiceStatus;
}

@Injectable()
export class ServicesService implements OnModuleInit, OnModuleDestroy {
  private readonly configRoot: string;
  private services: Map<string, ServiceConfig> = new Map();
  private processes: Map<string, pty.IPty> = new Map();
  private logs: Map<string, string[]> = new Map();
  private readonly LOG_MAX_LINES = 1000;

  constructor() {
    this.configRoot = resolve(process.cwd(), '../../data/configs');
  }

  async onModuleInit() {
    await this.loadConfigs();
  }

  async onModuleDestroy() {
    for (const process of this.processes.values()) {
      process.kill();
    }
    this.processes.clear();
  }

  async loadConfigs() {
    if (!existsSync(this.configRoot)) {
      await fs.mkdir(this.configRoot, { recursive: true });
    }

    const files = await fs.readdir(this.configRoot);
    this.services.clear();

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(join(this.configRoot, file), 'utf-8');
          const config = JSON.parse(content) as ServiceConfig;
          const id = file.replace('.json', '');
          this.services.set(id, { ...config, id });
        } catch (e) {
          console.error(`Failed to load config ${file}:`, e);
        }
      }
    }
  }

  getServices(): ServiceInfo[] {
    return Array.from(this.services.values()).map((config) => ({
      ...config,
      status: this.processes.has(config.id)
        ? ServiceStatus.RUNNING
        : ServiceStatus.STOPPED,
    }));
  }

  startService(id: string) {
    const config = this.services.get(id);
    if (!config) throw new NotFoundException('Service not found');
    if (this.processes.has(id)) return;

    const shell = process.env[process.platform === 'win32' ? 'COMSPEC' : 'SHELL'] || 'sh';
    
    let workingDir = config.cwd;
    if (!isAbsolute(workingDir)) {
      workingDir = resolve(process.cwd(), '../..', workingDir);
    }

    const ptyProcess = pty.spawn(shell, ['-c', config.command], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: workingDir,
      env: process.env as any,
    });

    this.processes.set(id, ptyProcess);
    this.logs.set(id, []);

    ptyProcess.onData((data) => {
      const buffer = this.logs.get(id) || [];
      buffer.push(data);
      if (buffer.length > this.LOG_MAX_LINES) {
        buffer.shift();
      }
      this.logs.set(id, buffer);
    });

    ptyProcess.onExit(() => {
      this.processes.delete(id);
    });

    return { status: 'starting' };
  }

  stopService(id: string) {
    const process = this.processes.get(id);
    if (process) {
      process.kill();
      this.processes.delete(id);
    }
    return { status: 'stopped' };
  }

  getLogs(id: string): string[] {
    if (!this.services.has(id)) throw new NotFoundException('Service not found');
    return this.logs.get(id) || [];
  }
}
