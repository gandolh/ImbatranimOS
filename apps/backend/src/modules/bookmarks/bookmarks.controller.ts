import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Get('groups')
  findAllGroups() {
    return this.bookmarksService.findAllGroups();
  }

  @Post('groups')
  createGroup(@Body() dto: CreateGroupDto) {
    return this.bookmarksService.createGroup(dto);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.bookmarksService.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  deleteGroup(@Param('id', ParseIntPipe) id: number) {
    return this.bookmarksService.deleteGroup(id);
  }

  @Post('links')
  createLink(@Body() dto: CreateLinkDto) {
    return this.bookmarksService.createLink(dto);
  }

  @Patch('links/:id')
  updateLink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.bookmarksService.updateLink(id, dto);
  }

  @Delete('links/:id')
  deleteLink(@Param('id', ParseIntPipe) id: number) {
    return this.bookmarksService.deleteLink(id);
  }
}
