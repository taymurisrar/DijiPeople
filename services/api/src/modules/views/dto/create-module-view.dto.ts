import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateModuleViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  moduleKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

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
