import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

export interface Todo {
  id: number;
  text: string;
  completed: number;
  position: number;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class TodosService {
  constructor(private readonly db: DbService) {}

  findAll(filter?: 'active' | 'completed'): Todo[] {
    let query = 'SELECT * FROM todos';
    if (filter === 'active') {
      query += ' WHERE completed = 0';
    } else if (filter === 'completed') {
      query += ' WHERE completed = 1';
    }
    query += ' ORDER BY position ASC';
    return this.db.db.prepare(query).all() as Todo[];
  }

  create(dto: CreateTodoDto): Todo {
    const maxRow = this.db.db
      .prepare('SELECT MAX(position) as max_pos FROM todos')
      .get() as { max_pos: number | null };
    const position = (maxRow.max_pos ?? 0) + 1;

    const info = this.db.db
      .prepare('INSERT INTO todos (text, completed, position) VALUES (@text, 0, @position)')
      .run({ text: dto.text, position });

    return this.db.db
      .prepare('SELECT * FROM todos WHERE id = ?')
      .get(info.lastInsertRowid) as Todo;
  }

  update(id: number, dto: UpdateTodoDto): Todo {
    const existing = this.db.db
      .prepare('SELECT * FROM todos WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Todo ${id} not found`);
    }

    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    if (dto.text !== undefined) {
      fields.push('text = @text');
      values['text'] = dto.text;
    }
    if (dto.completed !== undefined) {
      fields.push('completed = @completed');
      values['completed'] = dto.completed ? 1 : 0;
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    this.db.db
      .prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = @id`)
      .run(values);

    return this.db.db
      .prepare('SELECT * FROM todos WHERE id = ?')
      .get(id) as Todo;
  }

  reorder(ids: number[]): void {
    const update = this.db.db.prepare(
      'UPDATE todos SET position = @position WHERE id = @id',
    );
    const reorderAll = this.db.db.transaction((idList: number[]) => {
      for (let i = 0; i < idList.length; i++) {
        update.run({ position: i + 1, id: idList[i] });
      }
    });
    reorderAll(ids);
  }

  remove(id: number): void {
    const existing = this.db.db
      .prepare('SELECT id FROM todos WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Todo ${id} not found`);
    }
    this.db.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  }
}
