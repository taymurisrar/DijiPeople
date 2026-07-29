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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(36500)
  minimumServiceDays?: number;

  @IsOptional()
  @IsBoolean()
  prorateOnJoining?: boolean;

  @IsOptional()
  @IsBoolean()
  prorateOnExit?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  maximumNegativeBalance?: number;

  @IsEnum(LeaveRuleAccrualTypeValues)
  accrualType!: LeaveRuleAccrualType;

  @IsOptional()
  @IsEnum(LeaveAccrualFrequencyValues)
  accrualFrequency?: LeaveAccrualFrequency;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  accrualDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  accrualAmount?: number;

  @IsOptional()
  @IsBoolean()
  accrueDuringProbation?: boolean;

  @IsOptional()
  @IsBoolean()
  creditOnJoining?: boolean;

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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1200)
  carryForwardExpiryMonths?: number;

  @IsOptional()
  @IsBoolean()
  encashUnusedBalance?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  maximumEncashmentDays?: number;

  @IsOptional()
  @IsBoolean()
  negativeBalanceAllowed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  minimumNoticeDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  minimumConsecutiveDays?: number;

  @IsOptional()
  @IsBoolean()
  allowDuringProbation?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBackdatedRequests?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  maxBackdatedDays?: number;

  @IsOptional()
  @IsBoolean()
  allowFutureRequests?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  maxFutureDays?: number;

  @IsOptional()
  @IsBoolean()
  blockDuringNoticePeriod?: boolean;

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
  @IsUUID()
  approvalMatrixId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  autoApproveUnderDays?: number;

  @IsOptional()
  @IsBoolean()
  requireHrApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePayrollApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
