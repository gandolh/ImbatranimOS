import { IsOptional, IsUUID } from 'class-validator';

export class LeaseDto {
  /** The lease being renewed; absent to take a new one. */
  @IsOptional()
  @IsUUID()
  lease?: string;
}
