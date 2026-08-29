import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

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

  /*
   * `requireRemoteLocationForRemoteMode` and `allowRemoteWithoutLocation` used
   * to be accepted here. They are removed rather than deprecated: device
   * location capture is a platform mandate (see MANDATORY_LOCATION_CAPTURE in
   * attendance.service.ts), neither column has ever been read in an enforcement
   * branch, and offering input that can never take effect is exactly the defect
   * BUG-1981 records. The columns are still written - at the mandated values -
   * so the stored policy agrees with what the engine actually does.
   */

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

  /*
   * `locationCaptureRequired`, `locationRequiredForModes` and
   * `allowManualLocationException` were accepted here too, for the same reason
   * and with the same effect: none of them is read by the enforcement path.
   * They are part of the same mandate and are written at its values.
   */

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowIpFallback?: boolean;

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

  /*
   * `captureLocationOnCheckIn` and `captureLocationOnCheckOut` are likewise
   * mandated rather than configurable.
   */

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  storeIpAddress?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  storeUserAgent?: boolean;
}
