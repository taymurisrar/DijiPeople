import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsIn,
  MinLength,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TENANT_SETTING_CATEGORIES } from '../tenant-settings.catalog';

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class TenantSettingUpdateItemDto {
  @Transform(trimString)
  @IsString()
  @IsIn(TENANT_SETTING_CATEGORIES)
  category!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key!: string;

  @Allow()
  value!: unknown;
}

export class UpdateTenantSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TenantSettingUpdateItemDto)
  updates!: TenantSettingUpdateItemDto[];
}
