import {
  AttendanceMethod,
  WorkSiteDevicePolicy,
  WorkSiteWebAttendancePolicy,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Empty string means "clear this override", which is null, not undefined. */
function emptyStringToNull({ value }: { value: unknown }) {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  return value.trim().length === 0 ? null : value.trim();
}

/**
 * Numeric override that can be cleared.
 *
 * `@Type(() => Number)` cannot be used alongside the empty-string handling:
 * it turns "" into 0 before the transform runs, and 0 then fails @Min(1)
 * instead of clearing the override. So the conversion happens here.
 */
function emptyStringToNullableInt({ value }: { value: unknown }) {
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  addressLine1?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  state!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  country!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(20)
  zipCode?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  allowedRadiusMeters?: number;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  defaultWorkScheduleId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  holidayCalendarId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /*
   * Work site attendance configuration.
   *
   * Every field here is nullable on the model and null carries meaning: it is
   * "inherit the tenant setting", not "off". So these accept an explicit null
   * (and an empty string, which the settings form sends when a field is
   * cleared) and translate it to null rather than dropping it — otherwise an
   * administrator could never undo a work site override once set.
   */
  @IsOptional()
  @Transform(emptyStringToNull)
  @IsBoolean()
  attendanceEnabled?: boolean | null;

  @IsOptional()
  @Transform(emptyStringToNullableInt)
  @IsInt()
  @Min(1)
  maximumAccuracyMeters?: number | null;

  @IsOptional()
  @IsArray()
  @IsEnum(AttendanceMethod, { each: true })
  allowedAttendanceMethods?: AttendanceMethod[];

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsEnum(WorkSiteWebAttendancePolicy)
  webAttendancePolicy?: WorkSiteWebAttendancePolicy | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsEnum(WorkSiteDevicePolicy)
  devicePolicy?: WorkSiteDevicePolicy | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsBoolean()
  webFallbackEnabled?: boolean | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsDateString()
  validTo?: string | null;
}
