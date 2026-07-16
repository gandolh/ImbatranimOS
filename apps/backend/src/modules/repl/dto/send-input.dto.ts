import { IsNotEmpty, IsString } from 'class-validator';

export class SendInputDto {
  @IsString()
  @IsNotEmpty()
  command: string;
}
