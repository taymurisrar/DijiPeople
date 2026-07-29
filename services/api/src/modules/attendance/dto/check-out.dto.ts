import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CheckOutDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  workSummary?: string;

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
  checkOutAddressText?: string;
}
