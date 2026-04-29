import { PayrollCycleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PayrollCycleQueryDto {
  @IsOptional()
  @IsEnum(PayrollCycleStatus)
  status?: PayrollCycleStatus;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  processingCycleId?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize = 24;
}
