import { IsInt, IsPositive } from 'class-validator';

export class CreateSessionDto {
  @IsInt()
  @IsPositive()
  configId: number;
}
