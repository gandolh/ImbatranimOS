import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateLinkDto {
  @IsNumber()
  group_id: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  href: string;

  @IsString()
  @IsOptional()
  icon?: string;
}
