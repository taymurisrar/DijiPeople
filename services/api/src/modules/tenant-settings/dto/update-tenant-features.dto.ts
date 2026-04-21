import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TenantFeatureUpdateItemDto {
  @IsString()
  @MaxLength(100)
  key!: string;

  @IsBoolean()
  isEnabled!: boolean;
}

export class UpdateTenantFeaturesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TenantFeatureUpdateItemDto)
  updates!: TenantFeatureUpdateItemDto[];
}

