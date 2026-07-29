import { TimesheetPolicyScopeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTimesheetPolicyDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(80)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(TimesheetPolicyScopeType)
  scopeType!: TimesheetPolicyScopeType;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority = 0;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled = true;

  @IsOptional()
  @IsBoolean()
  inheritUnspecified = true;

  @IsObject()
  settings!: Record<string, unknown>;
}

export class UpdateTimesheetPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inheritUnspecified?: boolean;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class TimesheetPolicyPreviewQueryDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
