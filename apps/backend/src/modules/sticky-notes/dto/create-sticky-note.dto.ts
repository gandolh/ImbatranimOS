import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateStickyNoteDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsInt()
  @IsOptional()
  pos_x?: number;

  @IsInt()
  @IsOptional()
  pos_y?: number;
}
