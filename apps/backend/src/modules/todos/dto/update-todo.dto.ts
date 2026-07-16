import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class UpdateTodoDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  text?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}
