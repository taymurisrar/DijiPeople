import {
  OvertimeCalculationPeriod,
  TimePayrollMode,
  TimeProrationBasis,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const CODE_PATTERN = /^[A-Z0-9_ -]+$/i;

export class CreateTimePayrollPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string | null;

  @IsEnum(TimePayrollMode)
  mode!: TimePayrollMode;

  @IsOptional()
  @IsBoolean()
  useAttendanceForPayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  useTimesheetForPayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttendanceApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requireTimesheetApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  detectNoShow?: boolean;

  @IsOptional()
  @IsBoolean()
  deductNoShow?: boolean;

  @IsOptional()
  @IsBoolean()
  overtimeEnabled?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  standardHoursPerDay!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  standardWorkingDaysPerMonth?: number | null;

  @IsEnum(TimeProrationBasis)
  prorationBasis!: TimeProrationBasis;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class UpdateTimePayrollPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string | null;

  @IsOptional()
  @IsEnum(TimePayrollMode)
  mode?: TimePayrollMode;

  @IsOptional()
  @IsBoolean()
  useAttendanceForPayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  useTimesheetForPayroll?: boolean;

  @IsOptional()
  @IsBoolean()
  requireAttendanceApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requireTimesheetApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  detectNoShow?: boolean;

  @IsOptional()
  @IsBoolean()
  deductNoShow?: boolean;

  @IsOptional()
  @IsBoolean()
  overtimeEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  standardHoursPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  standardWorkingDaysPerMonth?: number | null;

  @IsOptional()
  @IsEnum(TimeProrationBasis)
  prorationBasis?: TimeProrationBasis;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class CreateOvertimePolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @IsEnum(OvertimeCalculationPeriod)
  calculationPeriod!: OvertimeCalculationPeriod;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  thresholdHours!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  rateMultiplier!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  normalOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weekendOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  holidayOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nightOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumOtMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumOtHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  roundToMinutes?: number | null;

  @IsOptional()
  @IsUUID()
  payComponentId?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class UpdateOvertimePolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @IsOptional()
  @IsEnum(OvertimeCalculationPeriod)
  calculationPeriod?: OvertimeCalculationPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  thresholdHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  rateMultiplier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  normalOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weekendOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  holidayOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nightOtMultiplier?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumOtMinutes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumOtHours?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  roundToMinutes?: number | null;

  @IsOptional()
  @IsUUID()
  payComponentId?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}
