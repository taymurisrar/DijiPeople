import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  COMPARISON_MODES,
  PERIOD_PRESETS,
  type ComparisonMode,
  type Granularity,
  type PeriodPreset,
} from '../engine/period.engine';

const FILTER_OPERATORS = [
  'eq',
  'ne',
  'contains',
  'startswith',
  'endswith',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notin',
  'between',
  'isnull',
  'isnotnull',
] as const;

/**
 * A single filter.
 *
 * `value` is intentionally untyped here: its shape depends on the field, and
 * the semantic registry is what knows. Typing it as `string` in the DTO would
 * force the client to stringify numbers and dates, and would create a second,
 * weaker validation that disagrees with `filter.model.ts`. The DTO's job is to
 * bound the request; the engine's job is to decide what the value means.
 */
export class ReportFilterDto {
  @IsString()
  @MaxLength(120)
  field!: string;

  @IsIn(FILTER_OPERATORS as unknown as string[])
  operator!: (typeof FILTER_OPERATORS)[number];

  @IsOptional()
  value?: unknown;

  @IsOptional()
  valueTo?: unknown;
}

export class AnalyticsQueryDto {
  @IsString()
  @MaxLength(80)
  sourceKey!: string;

  @IsOptional()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPreset;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(COMPARISON_MODES as unknown as string[])
  comparison?: ComparisonMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  metricKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  breakdown?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trendMetricKey?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'quarter'])
  granularity?: Granularity;
}

export class AnalyticsRecordsDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  fields?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  // The engine clamps to MAX_PAGE_SIZE as well; this bound is the first refusal.
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sortField?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}

export class RunReportDto {
  @IsString()
  @MaxLength(200)
  targetKey!: string;

  @IsOptional()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPreset;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sortField?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';

  @IsOptional()
  @IsBoolean()
  recordView?: boolean;
}
