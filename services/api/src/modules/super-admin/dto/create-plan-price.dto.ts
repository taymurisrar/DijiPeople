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

export const SUPPORTED_PLAN_PRICE_CURRENCIES = [
  'USD',
  'QAR',
  'AED',
  'SAR',
  'GBP',
  'EUR',
  'PKR',
] as const;

export class CreatePlanPriceDto {
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  @IsIn(SUPPORTED_PLAN_PRICE_CURRENCIES)
  currency!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitAmount!: number;

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
