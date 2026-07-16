import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { StickyNotesModule } from './modules/sticky-notes/sticky-notes.module';
import { TodosModule } from './modules/todos/todos.module';
import { NotesModule } from './modules/notes/notes.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { DockerModule } from './modules/docker/docker.module';
import { ServicesModule } from './modules/services/services.module';
import { SystemModule } from './modules/system/system.module';
import { ReplModule } from './modules/repl/repl.module';
import { FilesModule } from './modules/files/files.module';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    StickyNotesModule,
    TodosModule,
    NotesModule,
    BookmarksModule,
    DockerModule,
    ServicesModule,
    SystemModule,
    ReplModule,
    FilesModule,
  ],
})
export class AppModule {}
