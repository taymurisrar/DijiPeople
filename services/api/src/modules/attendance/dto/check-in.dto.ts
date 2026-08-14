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
  /**
   * A HINT, and only a hint.
   *
   * The server decides the work mode from the reported position: which
   * authorised work site the employee is standing in, whether that site requires
   * a device, and whether their arrangement permits remote work. A client that
   * could assert its own mode would turn the office-device rule into a
   * suggestion anyone could opt out of, so this is optional and is overridden by
   * the server's own evaluation whenever a position is supplied.
   *
   * Retained as optional rather than removed because the Electron agent and
   * older web builds still send it.
   */
  @IsOptional()
  @IsEnum(AttendanceMode)
  attendanceMode?: AttendanceMode;

  /**
   * Also a hint. The geofence decides which site the punch belongs to; a browser
   * must not be able to claim attendance at an office it is not standing in.
   */
  @IsOptional()
  @ValidateIf((value: CheckInDto) => Boolean(value.officeLocationId))
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
