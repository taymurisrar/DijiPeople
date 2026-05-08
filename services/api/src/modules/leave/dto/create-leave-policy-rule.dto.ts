import type {
  LeaveAccrualFrequency,
  LeaveRuleAccrualType,
} from '@prisma/client';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const LeaveRuleAccrualTypeValues = {
  FIXED_ANNUAL: 'FIXED_ANNUAL',
  MONTHLY_ACCRUAL: 'MONTHLY_ACCRUAL',
  PER_PAY_PERIOD: 'PER_PAY_PERIOD',
  PER_WORKED_HOUR: 'PER_WORKED_HOUR',
  NONE: 'NONE',
} as const;

const LeaveAccrualFrequencyValues = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY',
  PAY_PERIOD: 'PAY_PERIOD',
} as const;

export class CreateLeavePolicyRuleDto {
  @IsUUID()
  leaveTypeId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  entitlementDays?: number;

  @IsEnum(LeaveRuleAccrualTypeValues)
  accrualType!: LeaveRuleAccrualType;

  @IsOptional()
  @IsEnum(LeaveAccrualFrequencyValues)
  accrualFrequency?: LeaveAccrualFrequency;

  @IsOptional()
  @IsBoolean()
  carryForwardAllowed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  carryForwardLimit?: number;

  @IsOptional()
  @IsBoolean()
  negativeBalanceAllowed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  requiresDocumentAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  probationRestriction?: boolean;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): string | undefined => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    return String(value);
  })
  @IsString()
  genderRestriction?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  minServiceMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  maxConsecutiveDays?: number;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
