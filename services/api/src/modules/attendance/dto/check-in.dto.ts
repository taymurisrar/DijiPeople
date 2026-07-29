import { AttendanceMode } from '@prisma/client';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CheckInDto {
  @IsEnum(AttendanceMode)
  attendanceMode!: AttendanceMode;

  @ValidateIf(
    (value: CheckInDto) =>
      (value.attendanceMode ?? AttendanceMode.OFFICE) === AttendanceMode.OFFICE,
  )
  @IsUUID()
  officeLocationId?: string;

  @IsOptional()
  @IsNumber()
  remoteLatitude?: number;

  @IsOptional()
  @IsNumber()
  remoteLongitude?: number;

  @IsOptional()
  @IsNumber()
  locationAccuracy?: number;

  @IsOptional()
  @IsString()
  locationCapturedAt?: string;

  @IsOptional()
  @IsNumber()
  locationLatitude?: number;

  @IsOptional()
  @IsNumber()
  locationLongitude?: number;

  @IsOptional()
  @IsInt()
  locationAccuracyMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  locationSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  locationConfidence?: string;

  @IsOptional()
  @IsString()
  locationPermissionState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationFailureReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  userAgent?: string;

  @IsOptional()
  @IsBoolean()
  manualLocationExceptionRequested?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  manualLocationExceptionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remoteAddressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  checkInAddressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  workSummary?: string;
}
