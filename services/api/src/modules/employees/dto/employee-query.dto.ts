import { EmployeeEmploymentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TEXT_FILTER_OPERATORS = ['contains', 'equals', 'startsWith'] as const;
const DATE_FILTER_OPERATORS = ['equals', 'before', 'after', 'between'] as const;

function parseColumnsQuery(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((column) => column.trim())
    .filter((column) => column.length > 0);
}

export class EmployeeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(EmployeeEmploymentStatus)
  employmentStatus?: EmployeeEmploymentStatus;

  @IsOptional()
  @IsUUID()
  reportingManagerEmployeeId?: string;

  @IsOptional()
  @IsUUID('4')
  viewId?: string;

  @IsOptional()
  @Transform(({ value }) => parseColumnsQuery(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  columns?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameFilter?: string;

  @IsOptional()
  @IsIn(TEXT_FILTER_OPERATORS)
  nameFilterOperator?: (typeof TEXT_FILTER_OPERATORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  codeFilter?: string;

  @IsOptional()
  @IsIn(TEXT_FILTER_OPERATORS)
  codeFilterOperator?: (typeof TEXT_FILTER_OPERATORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  statusFilter?: string;

  @IsOptional()
  @IsIn(['equals'])
  statusFilterOperator?: 'equals';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reportingManagerFilter?: string;

  @IsOptional()
  @IsIn(TEXT_FILTER_OPERATORS)
  reportingManagerFilterOperator?: (typeof TEXT_FILTER_OPERATORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  hireDateFilter?: string;

  @IsOptional()
  @IsIn(DATE_FILTER_OPERATORS)
  hireDateFilterOperator?: (typeof DATE_FILTER_OPERATORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  hireDateFilterTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactFilter?: string;

  @IsOptional()
  @IsIn(TEXT_FILTER_OPERATORS)
  contactFilterOperator?: (typeof TEXT_FILTER_OPERATORS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
