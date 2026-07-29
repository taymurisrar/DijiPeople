import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { TimesheetExportFormat, TimesheetStatus } from '@prisma/client';

export class TimesheetExportFormatDto {
  @IsOptional()
  @IsEnum(TimesheetExportFormat)
  format: TimesheetExportFormat = TimesheetExportFormat.CSV;
}

export class CreateTimesheetExportDto {
  @IsIn(['CURRENT', 'SELECTED', 'ADVANCED'])
  exportType!: 'CURRENT' | 'SELECTED' | 'ADVANCED';

  @IsEnum(TimesheetExportFormat)
  format!: TimesheetExportFormat;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  timesheetIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  employeeIds?: string[];

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  projectIds?: string[];

  @IsOptional()
  @IsString()
  timezone?: string;
}
