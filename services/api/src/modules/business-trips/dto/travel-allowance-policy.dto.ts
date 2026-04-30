import {
  TravelAllowanceCalculationBasis,
  TravelAllowanceType,
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
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTravelAllowancePolicyDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  countryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class UpdateTravelAllowancePolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
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
  employeeLevelId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  countryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

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

export class CreateTravelAllowanceRuleDto {
  @IsEnum(TravelAllowanceType)
  allowanceType!: TravelAllowanceType;

  @IsEnum(TravelAllowanceCalculationBasis)
  calculationBasis!: TravelAllowanceCalculationBasis;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount!: number;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTravelAllowanceRuleDto {
  @IsOptional()
  @IsEnum(TravelAllowanceType)
  allowanceType?: TravelAllowanceType;

  @IsOptional()
  @IsEnum(TravelAllowanceCalculationBasis)
  calculationBasis?: TravelAllowanceCalculationBasis;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
