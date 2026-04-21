import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TenantFeatureSource } from '@prisma/client';

class TenantFeatureUpdateItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  key!: string;

  @IsBoolean()
  isEnabled!: boolean;

  @IsOptional()
  @IsEnum(TenantFeatureSource)
  source?: TenantFeatureSource;
}

export class UpdateTenantFeaturesDto {
  @IsArray()
  @ArrayUnique((item: TenantFeatureUpdateItemDto) => item.key)
  @ValidateNested({ each: true })
  @Type(() => TenantFeatureUpdateItemDto)
  features!: TenantFeatureUpdateItemDto[];
}
