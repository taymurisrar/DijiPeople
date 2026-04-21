import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsIn,
} from 'class-validator';

export class UpdateModuleViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  slug?: string;

  @IsOptional()
  @IsString()
  @IsIn(['system', 'custom'])
  type?: 'system' | 'custom';

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['tenant', 'role', 'user'])
  visibilityScope?: 'tenant' | 'role' | 'user';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoleKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedUserIds?: string[];

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
