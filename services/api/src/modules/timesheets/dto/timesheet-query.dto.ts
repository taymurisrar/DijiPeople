import { TimesheetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TimesheetQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  @IsOptional()
  @IsString()
  @IsIn(['yearMonth', 'employee', 'status', 'updatedAt'])
  sortField?: 'yearMonth' | 'employee' | 'status' | 'updatedAt';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize = 50;
}
