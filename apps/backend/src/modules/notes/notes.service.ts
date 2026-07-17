import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { UpsertRecentDto } from './dto/upsert-recent.dto';

@Injectable()
export class NotesService {
  constructor(private readonly db: DbService) {}

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
