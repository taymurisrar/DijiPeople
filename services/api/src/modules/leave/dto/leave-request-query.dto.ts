import { LeaveRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class LeaveRequestQueryDto {
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @IsOptional()
  @Type(() => Boolean)
  mineOnly?: boolean;

  /*
   * Column filters sent by the shared data table. Without these the request
   * was rejected as unknown properties, or the filter was silently ignored and
   * the list came back unchanged with no explanation.
   */
  @IsOptional()
  @IsString()
  employeeFilter?: string;

  @IsOptional()
  @IsString()
  employeeFilterOperator?: string;

  @IsOptional()
  @IsString()
  leaveTypeFilter?: string;

  @IsOptional()
  @IsString()
  leaveTypeFilterOperator?: string;

  @IsOptional()
  @IsString()
  statusFilter?: string;

  @IsOptional()
  @IsString()
  statusFilterOperator?: string;
}
