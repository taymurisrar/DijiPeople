import { PayrollCalendarFrequency, PayrollPeriodStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePayrollCalendarDto {
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEnum(PayrollCalendarFrequency)
  frequency!: PayrollCalendarFrequency;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePayrollCalendarDto {
  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(PayrollCalendarFrequency)
  frequency?: PayrollCalendarFrequency;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePayrollPeriodDto {
  @IsUUID()
  payrollCalendarId!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}

export class UpdatePayrollPeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;
}

export class CreatePayrollRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  runName?: string;

  @IsUUID()
  payrollPeriodId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  runNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeScope?: string;

  @IsOptional()
  @IsUUID()
  employerBankAccountId?: string;
}

/**
 * BUG-3800 — calendars and periods, with the search and opt-in paging the
 * generic lookups send. Absent, the list is the bare array the calendar and
 * period list pages map over; present, the `{items, meta}` envelope.
 */
export class PayrollCatalogQueryDto {
  @IsOptional()
  @IsUUID()
  payrollCalendarId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class PayrollCoreQueryDto {
  @IsOptional()
  @IsUUID()
  payrollCalendarId?: string;

  @IsOptional()
  @IsUUID()
  payrollPeriodId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;
}
