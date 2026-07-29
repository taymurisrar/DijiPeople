import { PayrollCalendarFrequency, ProcessingCycleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePayrollCycleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsUUID()
  payrollCalendarId?: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsOptional()
  @IsDateString()
  runDate?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  processingCycleId?: string;

  @IsOptional()
  @IsEnum(ProcessingCycleType)
  cycleType?: ProcessingCycleType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cycleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(PayrollCalendarFrequency)
  payFrequency?: PayrollCalendarFrequency;

  @IsOptional()
  @IsUUID()
  payrollRegionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currencyCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  periodStartRule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  periodEndRule?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @IsOptional()
  @IsBoolean()
  adjustDatesForWeekend?: boolean;

  @IsOptional()
  @IsBoolean()
  adjustDatesForHoliday?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  dateAdjustmentDirection?: string;

  @IsOptional()
  @IsUUID()
  defaultEmployerBankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  defaultGenerationSource?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class GeneratePayrollPeriodsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  periodCount: number = 12;
}
