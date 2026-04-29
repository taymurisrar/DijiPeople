import { PayslipStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

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
}
