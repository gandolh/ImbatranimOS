import { IsOptional, IsString } from 'class-validator';

export class UpdateConfigDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  command?: string;

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
