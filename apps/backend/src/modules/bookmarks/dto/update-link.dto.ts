import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateLinkDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  href?: string;

  @IsString()
  @IsOptional()
  icon?: string;
}
