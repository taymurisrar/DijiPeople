import { BillingCycle } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
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
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  @IsIn(SUPPORTED_PLAN_PRICE_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitAmount?: number;

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
