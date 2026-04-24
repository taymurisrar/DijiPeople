import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillingCycle, DiscountType } from '@prisma/client';

class OnboardingUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(190)
  workEmail!: string;
}

class ServiceAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(190)
  workEmail!: string;
}

class FeatureOverrideDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  key!: string;

  @IsBoolean()
  isEnabled!: boolean;
}

export class CreateCustomerOnboardingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  slug!: string;

  @IsEmail()
  @MaxLength(190)
  contactEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companySize?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsUUID()
  planId!: string;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  discountReason?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  manualFinalPrice?: number;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsBoolean()
  generateInitialInvoice?: boolean;

  @ValidateNested()
  @Type(() => OnboardingUserDto)
  primaryOwner!: OnboardingUserDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceAccountDto)
  serviceAccount?: ServiceAccountDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: FeatureOverrideDto) => item.key)
  @ValidateNested({ each: true })
  @Type(() => FeatureOverrideDto)
  featureOverrides?: FeatureOverrideDto[];
}
