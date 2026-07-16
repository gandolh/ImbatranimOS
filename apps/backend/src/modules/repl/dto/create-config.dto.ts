import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConfigDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  command: string;

  @IsString()
  @IsOptional()
  args?: string;

  @IsString()
  @IsOptional()
  cwd?: string;

  @IsString()
  @IsOptional()
  prompt_prefix?: string;
}
