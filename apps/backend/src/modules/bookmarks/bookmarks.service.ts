import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

export interface BookmarkLink {
  id: number;
  group_id: number;
  title: string;
  href: string;
  icon?: string;
}

export interface BookmarkGroup {
  id: number;
  name: string;
  icon?: string;
  links: BookmarkLink[];
}

@Injectable()
export class BookmarksService {
  constructor(private readonly db: DbService) {}

  findAllGroups(): BookmarkGroup[] {
    const groups = this.db.db
      .prepare('SELECT * FROM bookmark_groups ORDER BY id ASC')
      .all() as any[];

    const links = this.db.db
      .prepare('SELECT * FROM bookmark_links ORDER BY id ASC')
      .all() as BookmarkLink[];

    return groups.map((group) => ({
      ...group,
      links: links.filter((link) => link.group_id === group.id),
    }));
  }

  createGroup(dto: CreateGroupDto): BookmarkGroup {
    const info = this.db.db
      .prepare('INSERT INTO bookmark_groups (name, icon) VALUES (@name, @icon)')
      .run({ name: dto.name, icon: dto.icon ?? null });

    return {
      ...(this.db.db
        .prepare('SELECT * FROM bookmark_groups WHERE id = ?')
        .get(info.lastInsertRowid) as any),
      links: [],
    };
  }

  updateGroup(id: number, dto: UpdateGroupDto): BookmarkGroup {
    const existing = this.db.db
      .prepare('SELECT * FROM bookmark_groups WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Bookmark group ${id} not found`);
    }

    const fields: string[] = [];
    const values: any = { id };

    if (dto.name !== undefined) {
      fields.push('name = @name');
      values.name = dto.name;
    }
    if (dto.icon !== undefined) {
      fields.push('icon = @icon');
      values.icon = dto.icon;
    }

    if (fields.length > 0) {
      this.db.db
        .prepare(`UPDATE bookmark_groups SET ${fields.join(', ')} WHERE id = @id`)
        .run(values);
    }

    const group = this.db.db
      .prepare('SELECT * FROM bookmark_groups WHERE id = ?')
      .get(id) as any;
    const links = this.db.db
      .prepare('SELECT * FROM bookmark_links WHERE group_id = ?')
      .all(id) as BookmarkLink[];

    return { ...group, links };
  }

  deleteGroup(id: number): void {
    const existing = this.db.db
      .prepare('SELECT id FROM bookmark_groups WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Bookmark group ${id} not found`);
    }
    // CASCADE delete is handled by SQLite foreign key ON DELETE CASCADE
    this.db.db.prepare('DELETE FROM bookmark_groups WHERE id = ?').run(id);
  }

  createLink(dto: CreateLinkDto): BookmarkLink {
    const group = this.db.db
      .prepare('SELECT id FROM bookmark_groups WHERE id = ?')
      .get(dto.group_id);
    if (!group) {
      throw new NotFoundException(`Bookmark group ${dto.group_id} not found`);
    }

    const info = this.db.db
      .prepare(
        'INSERT INTO bookmark_links (group_id, title, href, icon) VALUES (@group_id, @title, @href, @icon)',
      )
      .run({
        group_id: dto.group_id,
        title: dto.title,
        href: dto.href,
        icon: dto.icon ?? null,
      });

    return this.db.db
      .prepare('SELECT * FROM bookmark_links WHERE id = ?')
      .get(info.lastInsertRowid) as BookmarkLink;
  }

  updateLink(id: number, dto: UpdateLinkDto): BookmarkLink {
    const existing = this.db.db
      .prepare('SELECT * FROM bookmark_links WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Bookmark link ${id} not found`);
    }

    const fields: string[] = [];
    const values: any = { id };

    if (dto.title !== undefined) {
      fields.push('title = @title');
      values.title = dto.title;
    }
    if (dto.href !== undefined) {
      fields.push('href = @href');
      values.href = dto.href;
    }
    if (dto.icon !== undefined) {
      fields.push('icon = @icon');
      values.icon = dto.icon;
    }

    if (fields.length > 0) {
      this.db.db
        .prepare(`UPDATE bookmark_links SET ${fields.join(', ')} WHERE id = @id`)
        .run(values);
    }

    return this.db.db
      .prepare('SELECT * FROM bookmark_links WHERE id = ?')
      .get(id) as BookmarkLink;
  }

  deleteLink(id: number): void {
    const existing = this.db.db
      .prepare('SELECT id FROM bookmark_links WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException(`Bookmark link ${id} not found`);
    }
    this.db.db.prepare('DELETE FROM bookmark_links WHERE id = ?').run(id);
  }
}
