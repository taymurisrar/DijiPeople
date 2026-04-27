import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdatePrimaryOwnerDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  confirmOwnershipTransfer?: boolean;
}
