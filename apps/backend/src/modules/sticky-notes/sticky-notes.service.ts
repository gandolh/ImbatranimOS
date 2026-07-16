import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateStickyNoteDto } from './dto/create-sticky-note.dto';
import { UpdateStickyNoteDto } from './dto/update-sticky-note.dto';

export interface StickyNote {
  id: number;
  content: string;
  pos_x: number;
  pos_y: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class StickyNotesService {
  constructor(private readonly db: DbService) {}

  findAll(): StickyNote[] {
    return this.db.db
      .prepare('SELECT * FROM sticky_notes ORDER BY created_at DESC')
      .all() as StickyNote[];
  }

  create(dto: CreateStickyNoteDto): StickyNote {
    const stmt = this.db.db.prepare(
      `INSERT INTO sticky_notes (content, pos_x, pos_y)
       VALUES (@content, @pos_x, @pos_y)`,
    );
    const info = stmt.run({
      content: dto.content ?? '',
      pos_x: dto.pos_x ?? 100,
      pos_y: dto.pos_y ?? 100,
    });
    return this.db.db
      .prepare('SELECT * FROM sticky_notes WHERE id = ?')
      .get(info.lastInsertRowid) as StickyNote;
  }

  update(id: number, dto: UpdateStickyNoteDto): StickyNote {
    const existing = this.db.db
      .prepare('SELECT * FROM sticky_notes WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Sticky note ${id} not found`);
    }

    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    if (dto.content !== undefined) {
      fields.push('content = @content');
      values['content'] = dto.content;
    }
    if (dto.pos_x !== undefined) {
      fields.push('pos_x = @pos_x');
      values['pos_x'] = dto.pos_x;
    }
    if (dto.pos_y !== undefined) {
      fields.push('pos_y = @pos_y');
      values['pos_y'] = dto.pos_y;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    this.db.db
      .prepare(
        `UPDATE sticky_notes SET ${fields.join(', ')} WHERE id = @id`,
      )
      .run(values);

    return this.db.db
      .prepare('SELECT * FROM sticky_notes WHERE id = ?')
      .get(id) as StickyNote;
  }

  remove(id: number): void {
    const existing = this.db.db
      .prepare('SELECT id FROM sticky_notes WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Sticky note ${id} not found`);
    }
    this.db.db.prepare('DELETE FROM sticky_notes WHERE id = ?').run(id);
  }
}
