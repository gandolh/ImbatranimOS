import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { UpsertRecentDto } from './dto/upsert-recent.dto';
import { CreateFileDto, UpdateFileDto } from './dto/file-ops.dto';
import { CreateDirectoryDto } from './dto/directory-ops.dto';
import { FilesService } from '../files/files.service';

const NOTES_ROOT = 'notes';

@Injectable()
export class NotesService {
  constructor(
    private readonly db: DbService,
    private readonly filesService: FilesService,
  ) {}

  async list(path: string = '') {
    return this.filesService.list(NOTES_ROOT, path);
  }

  async readFile(path: string) {
    return this.filesService.readFile(NOTES_ROOT, path);
  }

  async createFile(dto: CreateFileDto) {
    const entry = await this.filesService.createFile(
      NOTES_ROOT,
      dto.path,
      dto.content ?? '',
    );
    return { path: entry.path, content: dto.content ?? '' };
  }

  async updateFile(dto: UpdateFileDto) {
    await this.filesService.writeFile(NOTES_ROOT, dto.path, dto.content);
    return { path: dto.path, content: dto.content };
  }

  async deleteFile(path: string) {
    await this.filesService.delete(NOTES_ROOT, path);
  }

  async createDirectory(dto: CreateDirectoryDto) {
    const entry = await this.filesService.createDirectory(NOTES_ROOT, dto.path);
    return { path: entry.path };
  }

  async deleteDirectory(path: string) {
    await this.filesService.delete(NOTES_ROOT, path);
  }

  getRecent() {
    return this.db.db
      .prepare('SELECT * FROM recent_files ORDER BY last_opened DESC LIMIT 10')
      .all();
  }

  upsertRecent(dto: UpsertRecentDto) {
    this.db.db
      .prepare(
        `INSERT INTO recent_files (path, last_opened)
         VALUES (@path, CURRENT_TIMESTAMP)
         ON CONFLICT(path) DO UPDATE SET last_opened = CURRENT_TIMESTAMP`,
      )
      .run({ path: dto.path });
    return { path: dto.path };
  }
}
