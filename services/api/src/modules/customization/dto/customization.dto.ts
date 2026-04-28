import {
  CustomizationFieldDataType,
  CustomizationFormType,
  ModuleViewType,
  ModuleViewVisibilityScope,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const METADATA_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export class UpdateCustomizationTableDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pluralDisplayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isCustomizable?: boolean;
}

export class CreateCustomizationColumnDto {
  @IsString()
  @Matches(METADATA_KEY_PATTERN)
  @MaxLength(80)
  columnKey!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsEnum(CustomizationFieldDataType)
  dataType!: CustomizationFieldDataType;

  @IsOptional()
  @IsEnum(CustomizationFieldDataType)
  fieldType?: CustomizationFieldDataType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSortable?: boolean;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @IsOptional()
  @IsNumber()
  minValue?: number;

  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsString()
  lookupTargetTableKey?: string;

  @IsOptional()
  @IsObject()
  optionSetJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  validationJson?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCustomizationColumnDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(CustomizationFieldDataType)
  fieldType?: CustomizationFieldDataType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSortable?: boolean;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @IsOptional()
  @IsNumber()
  minValue?: number;

  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsString()
  lookupTargetTableKey?: string;

  @IsOptional()
  @IsObject()
  optionSetJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  validationJson?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateCustomizationViewDto {
  @IsString()
  @Matches(METADATA_KEY_PATTERN)
  @MaxLength(80)
  viewKey!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(ModuleViewType)
  type?: ModuleViewType;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsObject()
  columnsJson!: Record<string, unknown>;

  @IsOptional()
  filtersJson?: Record<string, unknown>;

  @IsOptional()
  sortingJson?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ModuleViewVisibilityScope)
  visibilityScope?: ModuleViewVisibilityScope;
}

export class UpdateCustomizationViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(ModuleViewType)
  type?: ModuleViewType;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @IsOptional()
  @IsObject()
  columnsJson?: Record<string, unknown>;

  @IsOptional()
  filtersJson?: Record<string, unknown>;

  @IsOptional()
  sortingJson?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ModuleViewVisibilityScope)
  visibilityScope?: ModuleViewVisibilityScope;
}

export class CreateCustomizationFormDto {
  @IsString()
  @Matches(METADATA_KEY_PATTERN)
  @MaxLength(80)
  formKey!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(CustomizationFormType)
  type?: CustomizationFormType;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsObject()
  layoutJson!: Record<string, unknown>;
}

export class UpdateCustomizationFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(CustomizationFormType)
  type?: CustomizationFormType;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  layoutJson?: Record<string, unknown>;
}
