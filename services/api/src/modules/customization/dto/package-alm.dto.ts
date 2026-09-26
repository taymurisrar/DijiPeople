import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CustomizationEnvironmentVariableType } from '@prisma/client';

const SEMVER_PATTERN = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const PACKAGE_KEY_PATTERN = /^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/;
const PUBLISHER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;
const PREFIX_PATTERN = /^[a-z][a-z0-9]{1,7}$/;
const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/;

export class CreateCustomizationPublisherDto {
  @IsString()
  @Matches(PUBLISHER_KEY_PATTERN)
  publisherKey!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @Matches(PREFIX_PATTERN, {
    message:
      'prefix must be 2-8 lowercase letters or digits and start with a letter',
  })
  prefix!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class PackageDependencyDto {
  @IsString()
  @Matches(PACKAGE_KEY_PATTERN)
  @MaxLength(80)
  packageKey!: string;

  @IsOptional()
  @IsString()
  @Matches(PUBLISHER_KEY_PATTERN)
  publisherKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsString()
  @Matches(SEMVER_PATTERN)
  minVersion!: string;

  @IsOptional()
  @IsString()
  @Matches(SEMVER_PATTERN)
  maxVersion?: string;
}

export class SetPackageDependenciesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PackageDependencyDto)
  dependencies!: PackageDependencyDto[];
}

export class SetPackagePublisherDto {
  @IsString()
  @MaxLength(80)
  publisherId!: string;
}

export class ReleasePackageDto {
  @IsOptional()
  @IsString()
  @Matches(SEMVER_PATTERN)
  version?: string;

  /* The working version after this release: patch by default. */
  @IsOptional()
  @IsIn(['major', 'minor', 'patch'])
  nextBump?: 'major' | 'minor' | 'patch';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ExecutePackageImportDto {
  /* Values for required environment variables this workspace does not have yet. */
  @IsOptional()
  @IsObject()
  environmentValues?: Record<string, string>;

  /*
   * The deliberate, audited override for installing an older version over a
   * newer one. Off unless the administrator sets it.
   */
  @IsOptional()
  @IsBoolean()
  allowDowngrade?: boolean;
}

export class CreateEnvironmentVariableDto {
  @IsString()
  @MaxLength(80)
  packageId!: string;

  @IsString()
  @Matches(VARIABLE_KEY_PATTERN, {
    message:
      'variableKey must be <publisher prefix>_<name>, e.g. mis_oracleBaseUrl',
  })
  @MaxLength(80)
  variableKey!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(CustomizationEnvironmentVariableType)
  type!: CustomizationEnvironmentVariableType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultValue?: string;
}

export class SetEnvironmentVariableValueDto {
  @IsString()
  @MaxLength(4000)
  value!: string;
}
