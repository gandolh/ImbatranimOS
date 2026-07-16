import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDirectoryDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}
