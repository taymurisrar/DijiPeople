import { PayslipStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PayslipQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  payrollRunId?: string;

  @IsOptional()
  @IsEnum(PayslipStatus)
  status?: PayslipStatus;

  /*
   * BUG-3172 — the list is bounded. The response stays a plain array (three
   * screens consume it that way); `page` walks past the first `pageSize`.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
