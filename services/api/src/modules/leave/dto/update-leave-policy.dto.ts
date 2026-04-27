import { EmployeeGender, LeaveAccrualType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateLeavePolicyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(LeaveAccrualType)
  accrualType?: LeaveAccrualType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(366)
  annualEntitlement?: number;

  @IsOptional()
  @IsBoolean()
  carryForwardAllowed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(366)
  carryForwardLimit?: number;

  @IsOptional()
  @IsBoolean()
  negativeBalanceAllowed?: boolean;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEnum(EmployeeGender)
  genderRestriction?: EmployeeGender;

  @IsOptional()
  @IsBoolean()
  probationRestriction?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(365)
  requiresDocumentAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
