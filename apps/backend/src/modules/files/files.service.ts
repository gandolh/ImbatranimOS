import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { join, resolve, relative, basename, dirname, sep } from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as os from 'os';
import type { Readable } from 'stream';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

/**
 * Static roots: name → absolute directory. The `home` root is resolved
 * dynamically (see {@link FilesService.getRootDir}) so tests can point it at a
 * scratch dir via FILES_ROOT without re-importing the module.
 */
const ROOTS: Record<string, string> = {
  notes: resolve(process.cwd(), 'data/notes'),
};

@Injectable()
export class FilesService {
  /**
   * The real home root: FILES_ROOT env override, else the process user's home
   * dir. In the container this IS /home/imbatranim. Resolved per-call so an
   * env change (tests) takes effect without a module reload.
   */
  private homeRoot(): string {
    return resolve(process.env.FILES_ROOT || os.homedir());
  }

  /** Resolve a root name to an absolute directory. Throws if unknown. */
  private getRootDir(root: string): string {
    if (root === 'home') return this.homeRoot();
    const dir = ROOTS[root];
    if (!dir) throw new BadRequestException(`Unknown root: ${root}`);
    return dir;
  }

  /**
   * Fully percent-decode a path defensively (handles double/triple encoding
   * such as %252e). Stops on malformed input rather than throwing.
   */
  private fullyDecode(input: string): string {
    let prev = input;
    for (let i = 0; i < 6; i++) {
      let next: string;
      try {
        next = decodeURIComponent(prev);
      } catch {
        return prev; // malformed % sequence — treat remainder as literal
      }
      if (next === prev) return next;
      prev = next;
    }
    return prev;
  }

  /**
   * realpath that tolerates a not-yet-existing leaf: walks up to the nearest
   * existing ancestor, canonicalises THAT (following symlinks), then re-appends
   * the missing (symlink-free, because non-existent) tail. This is what makes
   * the jail symlink-proof for create/upload/mkdir targets.
   */
  private async realpathAllowingMissing(p: string): Promise<string> {
    const missing: string[] = [];
    let current = p;
    // Bounded by path depth; dirname eventually hits the fs root fixpoint.
    for (;;) {
      try {
        const real = await fs.realpath(current);
        return missing.length
          ? resolve(real, ...missing.slice().reverse())
          : real;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        const parent = dirname(current);
        if (parent === current) return p; // nothing on this path exists
        missing.push(basename(current));
        current = parent;
      }
    }
  }

  /**
   * Resolve a root-relative virtual path to an absolute, jailed host path.
   *
   * Defence in depth:
   *  1. Full percent-decode, so encoded traversal (%2e%2e, %252e) can't slip
   *     past — Express already decodes query strings once; this catches nested
   *     encoding and direct service calls.
   *  2. Reject NUL bytes.
   *  3. Strip leading slashes/backslashes so the path is always root-relative
   *     (an absolute input can never re-root the resolve).
   *  4. Lexical jail: the resolved path must equal the root or sit under
   *     `root + sep` — kills `../` escapes.
   *  5. Symlink jail: realpath both the root and the target (or its nearest
   *     existing ancestor) and re-verify containment — kills symlink escapes.
   */
  async resolveSafe(
    root: string,
    virtualPath = '',
  ): Promise<{ rootDir: string; abs: string }> {
    const rootDir = this.getRootDir(root);
    let vp = this.fullyDecode(virtualPath ?? '');
    if (vp.includes('\0')) throw new BadRequestException('Invalid path');
    vp = vp.replace(/^[/\\]+/, '');
    const abs = resolve(rootDir, vp);

    // (4) lexical containment
    if (abs !== rootDir && !abs.startsWith(rootDir + sep)) {
      throw new BadRequestException('Path traversal detected');
    }

    // (5) symlink containment
    const realRoot = await this.realpathAllowingMissing(rootDir);
    const realTarget = await this.realpathAllowingMissing(abs);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
      throw new BadRequestException('Path traversal detected');
    }

    return { rootDir, abs };
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private async toEntry(rootDir: string, absPath: string): Promise<FileEntry> {
    const stat = await fs.lstat(absPath);
    // Report the target type for symlinks so the UI treats them sensibly,
    // falling back to the link itself if the target is broken.
    let type: 'file' | 'directory' = stat.isDirectory() ? 'directory' : 'file';
    let size = stat.size;
    if (stat.isSymbolicLink()) {
      try {
        const t = await fs.stat(absPath);
        type = t.isDirectory() ? 'directory' : 'file';
        size = t.size;
      } catch {
        type = 'file';
      }
    }
    return {
      name: basename(absPath),
      path: relative(rootDir, absPath),
      type,
      size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  async list(root: string, virtualPath = ''): Promise<FileEntry[]> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    if (!(await this.exists(abs)))
      throw new NotFoundException('Directory not found');
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) throw new BadRequestException('Not a directory');

    const entries = await fs.readdir(abs, { withFileTypes: true });
    return Promise.all(
      entries.map((e) => this.toEntry(rootDir, join(abs, e.name))),
    );
  }

  async stat(root: string, virtualPath: string): Promise<FileEntry> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    if (!(await this.exists(abs))) throw new NotFoundException('Not found');
    return this.toEntry(rootDir, abs);
  }

  async readFile(
    root: string,
    virtualPath: string,
  ): Promise<{ path: string; content: string }> {
    const { abs } = await this.resolveSafe(root, virtualPath);
    if (!(await this.exists(abs))) throw new NotFoundException('File not found');
    const stat = await fs.stat(abs);
    if (stat.isDirectory())
      throw new BadRequestException('Path is a directory');
    const content = await fs.readFile(abs, 'utf-8');
    return { path: virtualPath, content };
  }

  async readFileStream(root: string, virtualPath: string): Promise<Readable> {
    const { abs } = await this.resolveSafe(root, virtualPath);
    if (!(await this.exists(abs))) throw new NotFoundException('File not found');
    const stat = await fs.stat(abs);
    if (stat.isDirectory())
      throw new BadRequestException('Path is a directory');
    return createReadStream(abs);
  }

  async writeFile(
    root: string,
    virtualPath: string,
    content: string,
  ): Promise<FileEntry> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
    return this.toEntry(rootDir, abs);
  }

  async createFile(
    root: string,
    virtualPath: string,
    content = '',
  ): Promise<FileEntry> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    if (await this.exists(abs)) throw new BadRequestException('Already exists');
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
    return this.toEntry(rootDir, abs);
  }

  async uploadFile(
    root: string,
    virtualPath: string,
    buffer: Buffer,
  ): Promise<FileEntry> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    await fs.mkdir(dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return this.toEntry(rootDir, abs);
  }

  async createDirectory(root: string, virtualPath: string): Promise<FileEntry> {
    const { rootDir, abs } = await this.resolveSafe(root, virtualPath);
    if (await this.exists(abs)) throw new BadRequestException('Already exists');
    await fs.mkdir(abs, { recursive: true });
    return this.toEntry(rootDir, abs);
  }

  async move(root: string, from: string, to: string): Promise<FileEntry> {
    const { rootDir, abs: absFrom } = await this.resolveSafe(root, from);
    const { abs: absTo } = await this.resolveSafe(root, to);
    if (!(await this.exists(absFrom)))
      throw new NotFoundException('Source not found');
    if (await this.exists(absTo))
      throw new BadRequestException('Destination already exists');
    await fs.mkdir(dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
    return this.toEntry(rootDir, absTo);
  }

  async copy(root: string, from: string, to: string): Promise<FileEntry> {
    const { rootDir, abs: absFrom } = await this.resolveSafe(root, from);
    const { abs: absTo } = await this.resolveSafe(root, to);
    if (!(await this.exists(absFrom)))
      throw new NotFoundException('Source not found');
    if (await this.exists(absTo))
      throw new BadRequestException('Destination already exists');
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
    const { abs } = await this.resolveSafe(root, virtualPath);
    if (!(await this.exists(abs))) throw new NotFoundException('Not found');
    const stat = await fs.lstat(abs);
    if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true });
    } else {
      await fs.unlink(abs);
    }
  }
}
