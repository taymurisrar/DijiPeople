import { BillingCycle, BillingInterval, BillingModel } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_PLAN_PRICE_CURRENCIES } from './create-plan-price.dto';

export class UpdatePlanPriceDto {
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsEnum(BillingModel)
  billingModel?: BillingModel;

  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  @IsIn(SUPPORTED_PLAN_PRICE_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maximumSeats?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedSeats?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^price_[A-Za-z0-9_]+$/, {
    message: 'stripePriceId must start with price_.',
  })
  stripePriceId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
