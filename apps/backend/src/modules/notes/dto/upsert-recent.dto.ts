import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertRecentDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}
