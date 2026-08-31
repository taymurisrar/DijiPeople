import { ReportVisibilityScope } from '@prisma/client';
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
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PERIOD_PRESETS, type PeriodPreset } from '../engine/period.engine';
import { ReportFilterDto } from './analytics-query.dto';

/**
 * The builder's saved shape.
 *
 * Validated twice on purpose. `class-validator` bounds it here — sizes, types,
 * enum membership — and `report-definition.validator.ts` then resolves every
 * field key against the semantic registry *for this user*. The first is about
 * the request being well formed; the second is about the caller being allowed
 * to ask, and the second has to run again at execution time because access
 * shrinks.
 */
export class ReportConfigDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  columns!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  groupBy?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsObject({ each: true })
  aggregations?: Array<{ field: string; aggregation: string }>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sortField?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPreset;

  @IsOptional()
  @IsIn(['table', 'bar', 'line', 'donut'])
  visualization?: 'table' | 'bar' | 'line' | 'donut';
}

export class CreateReportDefinitionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(80)
  category!: string;

  @IsString()
  @MaxLength(80)
  dataSourceKey!: string;

  @ValidateNested()
  @Type(() => ReportConfigDto)
  config!: ReportConfigDto;

  @IsOptional()
  @IsEnum(ReportVisibilityScope)
  visibilityScope?: ReportVisibilityScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  allowedRoleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  allowedUserIds?: string[];
}

export class UpdateReportDefinitionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportConfigDto)
  config?: ReportConfigDto;

  @IsOptional()
  @IsEnum(ReportVisibilityScope)
  visibilityScope?: ReportVisibilityScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  allowedRoleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  allowedUserIds?: string[];
}

export class SavedViewConfigDto {
  @IsOptional()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPreset;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  comparison?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  breakdown?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  metricKeys?: string[];
}

export class CreateSavedViewDto {
  @IsString()
  @MaxLength(80)
  surfaceKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ValidateNested()
  @Type(() => SavedViewConfigDto)
  config!: SavedViewConfigDto;

  @IsOptional()
  @IsEnum(ReportVisibilityScope)
  visibilityScope?: ReportVisibilityScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  allowedRoleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  allowedUserIds?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSavedViewDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SavedViewConfigDto)
  config?: SavedViewConfigDto;

  @IsOptional()
  @IsEnum(ReportVisibilityScope)
  visibilityScope?: ReportVisibilityScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  allowedRoleKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  allowedUserIds?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class FavoriteDto {
  @IsString()
  @MaxLength(200)
  targetKey!: string;
}
