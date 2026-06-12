import {
  CustomizationFieldDataType,
  CustomizationFormType,
  ModuleViewType,
  ModuleViewVisibilityScope,
} from '@prisma/client';
import {
  IsBoolean,
  IsArray,
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
const PACKAGE_KEY_PATTERN = /^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/;
const FIELD_LOGICAL_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*_[a-z][a-zA-Z0-9]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export class CreateCustomizationTableDto {
  @IsOptional()
  @IsString()
  packageId?: string;

  @IsString()
  @Matches(METADATA_KEY_PATTERN)
  @MaxLength(80)
  tableKey!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MaxLength(120)
  pluralDisplayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  systemName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleKey?: string;

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
}

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
  @IsOptional()
  @IsString()
  packageId?: string;

  @IsString()
  @Matches(FIELD_LOGICAL_NAME_PATTERN)
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
  isVisibleInCustomization?: boolean;

  @IsOptional()
  @IsBoolean()
  isValidForFormDesigner?: boolean;

  @IsOptional()
  @IsBoolean()
  isValidForViewDesigner?: boolean;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

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
  packageId?: string;

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
  isVisibleInCustomization?: boolean;

  @IsOptional()
  @IsBoolean()
  isValidForFormDesigner?: boolean;

  @IsOptional()
  @IsBoolean()
  isValidForViewDesigner?: boolean;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

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
  @IsOptional()
  @IsString()
  packageId?: string;

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
  packageId?: string;

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
  @IsOptional()
  @IsString()
  packageId?: string;

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
  packageId?: string;

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

export class CreateCustomizationPackageDto {
  @IsString()
  @Matches(PACKAGE_KEY_PATTERN)
  @MaxLength(80)
  packageKey!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MaxLength(100)
  publisherName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @Matches(SEMVER_PATTERN)
  @MaxLength(30)
  version!: string;
}

export class UpdateCustomizationPackageDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class AddExistingPackageComponentsDto {
  @IsString()
  componentType!: string;

  @IsArray()
  @IsString({ each: true })
  objectIds!: string[];
}

export class EnsureCustomizationLayerDto {
  @IsString()
  moduleKey!: string;

  @IsString()
  componentType!: string;

  @IsString()
  componentKey!: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  layerAction?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown>;
}

export class MoveCustomizationComponentsDto {
  @IsArray()
  @IsString({ each: true })
  componentIds!: string[];

  @IsString()
  targetPackageId!: string;
}

export class PreviewCustomizationPackageImportDto {
  @IsObject()
  manifest!: Record<string, unknown>;

  @IsArray()
  modules!: unknown[];

  @IsArray()
  components!: unknown[];

  @IsArray()
  dependencies!: unknown[];
}

export class PublishCustomizationComponentsDto {
  @IsArray()
  @IsString({ each: true })
  componentIds!: string[];
}
