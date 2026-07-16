// apps/backend/src/modules/repl/repl.service.ts
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolve, isAbsolute } from 'path';
import * as pty from 'node-pty';
import stripAnsi from 'strip-ansi';
import { DbService } from '../../db/db.service';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

export interface ReplConfig {
  id: number;
  name: string;
  command: string;
  args: string;
  cwd: string;
  prompt_prefix: string;
  created_at: string;
}

interface Session {
  pty: pty.IPty;
  configId: number;
  outputBuffer: string[];
  lastActivity: Date;
  busy: boolean;
  dead: boolean;
  deadMessage: string;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const OUTPUT_WAIT_MS = 300;

@Injectable()
export class ReplService implements OnModuleInit, OnModuleDestroy {
  private sessions = new Map<string, Session>();
  private idleInterval: NodeJS.Timeout;

  constructor(private readonly db: DbService) {}

  onModuleInit() {
    this.idleInterval = setInterval(() => this.reapIdleSessions(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.idleInterval);
    for (const session of this.sessions.values()) {
      try { session.pty.kill(); } catch {}
    }
    this.sessions.clear();
  }

  // ── Config CRUD ──────────────────────────────────────────────────────────

  findAllConfigs(): ReplConfig[] {
    return this.db.db
      .prepare('SELECT * FROM repl_configs ORDER BY id ASC')
      .all() as ReplConfig[];
  }

  createConfig(dto: CreateConfigDto): ReplConfig {
    const info = this.db.db
      .prepare(
        'INSERT INTO repl_configs (name, command, args, cwd, prompt_prefix) VALUES (@name, @command, @args, @cwd, @prompt_prefix)',
      )
      .run({
        name: dto.name,
        command: dto.command,
        args: dto.args ?? '',
        cwd: dto.cwd ?? '',
        prompt_prefix: dto.prompt_prefix ?? '>',
      });
    return this.db.db
      .prepare('SELECT * FROM repl_configs WHERE id = ?')
      .get(info.lastInsertRowid) as ReplConfig;
  }

  updateConfig(id: number, dto: UpdateConfigDto): ReplConfig {
    const existing = this.db.db
      .prepare('SELECT * FROM repl_configs WHERE id = ?')
      .get(id);
    if (!existing) throw new NotFoundException(`Config ${id} not found`);

    const fields: string[] = [];
    const values: Record<string, any> = { id };

    if (dto.name !== undefined) { fields.push('name = @name'); values.name = dto.name; }
    if (dto.command !== undefined) { fields.push('command = @command'); values.command = dto.command; }
    if (dto.args !== undefined) { fields.push('args = @args'); values.args = dto.args; }
    if (dto.cwd !== undefined) { fields.push('cwd = @cwd'); values.cwd = dto.cwd; }
    if (dto.prompt_prefix !== undefined) { fields.push('prompt_prefix = @prompt_prefix'); values.prompt_prefix = dto.prompt_prefix; }

    if (fields.length > 0) {
      this.db.db
        .prepare(`UPDATE repl_configs SET ${fields.join(', ')} WHERE id = @id`)
        .run(values);
    }

    return this.db.db
      .prepare('SELECT * FROM repl_configs WHERE id = ?')
      .get(id) as ReplConfig;
  }

  deleteConfig(id: number): void {
    const existing = this.db.db
      .prepare('SELECT id FROM repl_configs WHERE id = ?')
      .get(id);
    if (!existing) throw new NotFoundException(`Config ${id} not found`);

    // Kill any active sessions using this config before deleting
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.configId === id) {
        this.sessions.delete(sessionId);
        try { session.pty.kill(); } catch {}
      }
    }

    this.db.db.prepare('DELETE FROM repl_configs WHERE id = ?').run(id);
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  createSession(configId: number): { sessionId: string } {
    const config = this.db.db
      .prepare('SELECT * FROM repl_configs WHERE id = ?')
      .get(configId) as ReplConfig | undefined;
    if (!config) throw new NotFoundException(`Config ${configId} not found`);

    let workingDir = config.cwd || process.cwd();
    if (!isAbsolute(workingDir)) {
      workingDir = resolve(process.cwd(), workingDir);
    }

    const args = config.args ? config.args.split(' ').filter(Boolean) : [];

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(config.command, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: workingDir,
        env: process.env as Record<string, string>,
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to spawn process: ${(err as Error).message}`,
      );
    }

    const sessionId = randomUUID();
    const session: Session = {
      pty: ptyProcess,
      configId,
      outputBuffer: [],
      lastActivity: new Date(),
      busy: false,
      dead: false,
      deadMessage: '',
    };

    ptyProcess.onData((data) => {
      session.outputBuffer.push(data);
    });

    ptyProcess.onExit(() => {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.dead = true;
        s.deadMessage = '[process exited unexpectedly]';
      }
    });

    this.sessions.set(sessionId, session);
    return { sessionId };
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    try { session.pty.kill(); } catch {}
  }

  async sendInput(sessionId: string, command: string): Promise<{ output: string }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { output: '[session not found]' };
    }

    if (session.dead) {
      const msg = session.deadMessage;
      this.sessions.delete(sessionId);
      return { output: msg };
    }

    if (session.busy) {
      throw new ConflictException('Session is already processing a command');
    }

    session.busy = true;
    try {
      session.outputBuffer = [];
      session.lastActivity = new Date();

      try {
        session.pty.write(command + '\r');
      } catch {
        return { output: '[process exited unexpectedly]' };
      }

      await new Promise((res) => setTimeout(res, OUTPUT_WAIT_MS));

      const raw = session.outputBuffer.join('');
      session.outputBuffer = [];
      return { output: this.cleanOutput(raw, command) };
    } finally {
      session.busy = false;
    }
  }

  // ── Output cleaning ──────────────────────────────────────────────────────

  private cleanOutput(raw: string, command: string): string {
    let out = stripAnsi(raw);
    // Remove the echoed command (PTY echoes back what was typed)
    out = out.replace(command + '\r', '').replace(command + '\n', '');
    // Remove trailing prompt line (e.g. "> ", "$ ", ">>> ")
    const lines = out.split('\n');
    if (/^\s*[>$#»]\s*$/.test(lines[lines.length - 1])) {
      lines.pop();
    }
    return lines.join('\n').trim();
  }

  // ── Idle reaper ───────────────────────────────────────────────────────────

  private reapIdleSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.dead) continue; // will be cleaned on next sendInput
      if (now - session.lastActivity.getTime() > IDLE_TIMEOUT_MS) {
        session.dead = true;
        session.deadMessage = '[session timed out]';
        try { session.pty.kill(); } catch {}
        // Don't delete here — let sendInput return the message and clean up
      }
    }
  }
}
