import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ERROR_LOG_PERIODS,
  SUPPORT_STATUS_VALUES,
  UNRESOLVED_STATUS,
} from '../error-log-query';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * The query `GET /platform/logs/events` accepts.
 *
 * Until now the controller took `Record<string, string>`, so a malformed date
 * reached `new Date()` and became an `Invalid Date` inside a Prisma filter, and
 * nothing bounded a search string. Every key the admin console, the platform
 * runtime and older dashboard links send is declared here — the global
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so a key missing from this
 * class would turn a working link into a 400.
 *
 * Values stay strings (no `@Type(() => Number)`): the service normalises page
 * and size itself, and the platform runtime calls it directly with strings.
 * `sortBy` is deliberately free text — an unknown key falls back to the default
 * order rather than failing, because the runtime still sends `createdAt`.
 */
export class ListPlatformErrorLogsQueryDto {
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(6)
  page?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(3)
  pageSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  correlationId?: string;

  /* A group (`critical`, `warning`, `info`) or a stored level such as `ERROR`. */
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(20)
  severity?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsIn([UNRESOLVED_STATUS, ...SUPPORT_STATUS_VALUES])
  status?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsIn(['all', 'critical', 'open', 'new', 'investigating', 'resolved'])
  viewKey?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  sourceApp?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  environment?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(80)
  module?: string;

  /* A tenant id, or `platform` for incidents that resolved no tenant. */
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(300)
  route?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(10)
  method?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsIn(['all', ...Object.keys(ERROR_LOG_PERIODS)])
  period?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  from?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  to?: string;
}
