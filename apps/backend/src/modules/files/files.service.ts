import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { join, resolve, relative, basename, dirname } from 'path';
import * as fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import type { Readable } from 'stream';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

/**
 * Configured roots: name → absolute directory.
 * Adding a root is a one-line change here.
 */
const ROOTS: Record<string, string> = {
  notes: resolve(process.cwd(), 'data/notes'),
};

@Injectable()
export class FilesService {
  /** Resolve root directory. Throws if unknown root. */
  private getRootDir(root: string): string {
    const dir = ROOTS[root];
    if (!dir) throw new BadRequestException(`Unknown root: ${root}`);
    return dir;
  }

  /**
   * Resolve a root-relative virtual path to an absolute host path.
   * Rejects traversal outside the root.
   */
  getSafePath(root: string, virtualPath: string): string {
    const rootDir = this.getRootDir(root);
    const normalized = virtualPath.startsWith('/')
      ? virtualPath.substring(1)
      : virtualPath;
    const abs = resolve(rootDir, normalized);
    if (!abs.startsWith(rootDir)) {
      throw new BadRequestException('Path traversal detected');
    }
    return abs;
  }

  private async toEntry(
    rootDir: string,
    absPath: string,
  ): Promise<FileEntry> {
    const stat = await fs.stat(absPath);
    return {
      name: basename(absPath),
      path: relative(rootDir, absPath),
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  async list(root: string, virtualPath: string = ''): Promise<FileEntry[]> {
    const rootDir = this.getRootDir(root);
    const absPath = this.getSafePath(root, virtualPath);
    if (!existsSync(absPath)) throw new NotFoundException('Directory not found');
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) throw new BadRequestException('Not a directory');

    const entries = await fs.readdir(absPath, { withFileTypes: true });
    return Promise.all(
      entries.map((e) => this.toEntry(rootDir, join(absPath, e.name))),
    );
  }

  async stat(root: string, virtualPath: string): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absPath = this.getSafePath(root, virtualPath);
    if (!existsSync(absPath)) throw new NotFoundException('Not found');
    return this.toEntry(rootDir, absPath);
  }

  async readFile(root: string, virtualPath: string): Promise<{ path: string; content: string }> {
    const absPath = this.getSafePath(root, virtualPath);
    if (!existsSync(absPath)) throw new NotFoundException('File not found');
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) throw new BadRequestException('Path is a directory');
    const content = await fs.readFile(absPath, 'utf-8');
    return { path: virtualPath, content };
  }

  readFileStream(root: string, virtualPath: string): Readable {
    const absPath = this.getSafePath(root, virtualPath);
    if (!existsSync(absPath)) throw new NotFoundException('File not found');
    return createReadStream(absPath);
  }

  async writeFile(
    root: string,
    virtualPath: string,
    content: string,
  ): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absPath = this.getSafePath(root, virtualPath);
    // Ensure parent directory exists
    await fs.mkdir(dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');
    return this.toEntry(rootDir, absPath);
  }

  async createFile(
    root: string,
    virtualPath: string,
    content: string = '',
  ): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absPath = this.getSafePath(root, virtualPath);
    if (existsSync(absPath)) throw new BadRequestException('Already exists');
    await fs.mkdir(dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');
    return this.toEntry(rootDir, absPath);
  }

  async uploadFile(
    root: string,
    virtualPath: string,
    buffer: Buffer,
  ): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absPath = this.getSafePath(root, virtualPath);
    await fs.mkdir(dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);
    return this.toEntry(rootDir, absPath);
  }

  async createDirectory(root: string, virtualPath: string): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absPath = this.getSafePath(root, virtualPath);
    if (existsSync(absPath)) throw new BadRequestException('Already exists');
    await fs.mkdir(absPath, { recursive: true });
    return this.toEntry(rootDir, absPath);
  }

  async move(root: string, from: string, to: string): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absFrom = this.getSafePath(root, from);
    const absTo = this.getSafePath(root, to);
    if (!existsSync(absFrom)) throw new NotFoundException('Source not found');
    if (existsSync(absTo)) throw new BadRequestException('Destination already exists');
    await fs.mkdir(dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
    return this.toEntry(rootDir, absTo);
  }

  async copy(root: string, from: string, to: string): Promise<FileEntry> {
    const rootDir = this.getRootDir(root);
    const absFrom = this.getSafePath(root, from);
    const absTo = this.getSafePath(root, to);
    if (!existsSync(absFrom)) throw new NotFoundException('Source not found');
    if (existsSync(absTo)) throw new BadRequestException('Destination already exists');
    await fs.mkdir(dirname(absTo), { recursive: true });
    const stat = await fs.stat(absFrom);
    if (stat.isDirectory()) {
      await fs.cp(absFrom, absTo, { recursive: true });
    } else {
      await fs.copyFile(absFrom, absTo);
    }
    return this.toEntry(rootDir, absTo);
  }

  async delete(root: string, virtualPath: string): Promise<void> {
    const absPath = this.getSafePath(root, virtualPath);
    if (!existsSync(absPath)) throw new NotFoundException('Not found');
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true });
    } else {
      await fs.unlink(absPath);
    }
  }
}
