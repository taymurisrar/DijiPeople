import {
  DiscountType,
  PromotionDuration,
  PromotionScope,
} from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(80)
  code?: string | null;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentOff?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amountOff?: number | null;

  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string | null;

  @IsEnum(PromotionDuration)
  duration!: PromotionDuration;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMonths?: number | null;

  @IsOptional()
  @IsEnum(PromotionScope)
  scope?: PromotionScope;

  @IsOptional()
  @IsUUID()
  planId?: string | null;

  @IsOptional()
  @IsUUID()
  planPriceId?: string | null;

  @IsOptional()
  @IsUUID()
  customerAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  redeemBy?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maximumRedemptions?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  syncToStripe?: boolean;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}
