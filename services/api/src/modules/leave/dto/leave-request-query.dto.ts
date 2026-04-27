import { LeaveRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

export class LeaveRequestQueryDto {
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @IsOptional()
  @Type(() => Boolean)
  mineOnly?: boolean;
}
