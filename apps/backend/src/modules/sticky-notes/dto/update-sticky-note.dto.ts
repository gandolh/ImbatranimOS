import { IsString, IsOptional, IsInt } from 'class-validator';

export class UpdateStickyNoteDto {
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
