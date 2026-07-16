import { IsArray, IsInt } from 'class-validator';

export class ReorderTodosDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}
