import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WriteContentDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class CreateDirectoryDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  path: string;
}

export class MoveDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;
}

export class CopyDto {
  @IsString()
  @IsNotEmpty()
  root: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;
}
