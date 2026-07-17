import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** `?path=` where the sub-path is optional (list the notes root). */
export class OptionalPathQueryDto {
  @IsOptional()
  @IsString()
  path?: string;
}

/** `?path=` where a non-empty path is required (read/delete a specific entry). */
export class RequiredPathQueryDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}
