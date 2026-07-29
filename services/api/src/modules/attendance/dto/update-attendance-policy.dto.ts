import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { AttendanceMode } from '@prisma/client';

export class UpdateAttendancePolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  lateCheckInGraceMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  lateCheckOutGraceMinutes!: number;

  @Type(() => Boolean)
  @IsBoolean()
  requireOfficeLocationForOfficeMode!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  requireRemoteLocationForRemoteMode!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  allowRemoteWithoutLocation!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  allowManualAdjustments!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  preventDuplicateAttendance!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  allowCheckInOnApprovedLeave!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  markMissingCheckout!: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowOffDayCheckIn?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowHolidayCheckIn?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowHrAdminOverride?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  locationCaptureRequired?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(AttendanceMode, { each: true })
  locationRequiredForModes?: AttendanceMode[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowIpFallback?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowManualLocationException?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  locationTimeoutSeconds?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  highAccuracyLocation?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  maxAllowedAccuracyMeters?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  captureLocationOnCheckIn?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  captureLocationOnCheckOut?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  storeIpAddress?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  storeUserAgent?: boolean;
}
