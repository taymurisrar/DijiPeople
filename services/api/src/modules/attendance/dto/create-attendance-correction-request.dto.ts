import { AttendanceCorrectionType, EmployeeWorkMode } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * An employee's request to correct their own attendance.
 *
 * NOTHING HERE IS AN AUTHORITY FIELD. There is deliberately no employeeId,
 * tenantId, status or approver: the server derives who is asking from the
 * session, and a request always arrives PENDING_APPROVAL whatever the client
 * sends. Accepting any of those from the browser would let an employee approve
 * their own correction, or file one against somebody else.
 */
export class CreateAttendanceCorrectionRequestDto {
  @IsOptional()
  @IsUUID()
  attendanceEntryId?: string;

  /**
   * The work day being corrected, as YYYY-MM-DD.
   *
   * Needed because a wholly missing day has no AttendanceEntry to point at, and
   * that is exactly the case a "forgot to punch" correction covers.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'attendanceDate must be formatted YYYY-MM-DD.',
  })
  attendanceDate?: string;

  @IsEnum(AttendanceCorrectionType)
  correctionType!: AttendanceCorrectionType;

  @IsOptional()
  @IsDateString()
  requestedCheckInAtUtc?: string;

  @IsOptional()
  @IsDateString()
  requestedCheckOutAtUtc?: string;

  /** HYBRID is rejected server-side: it describes a day, not a work period. */
  @IsOptional()
  @IsEnum(EmployeeWorkMode)
  requestedWorkMode?: EmployeeWorkMode;

  @IsOptional()
  @IsUUID()
  requestedWorkSiteId?: string;

  /** Minutes of overtime sought, for an OVERTIME_APPROVAL request. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  requestedOvertimeMinutes?: number;

  /** Set when this is an in-office web punch raised because a device failed. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  fallbackReason?: string;

  /** Mandatory: a correction with no stated reason cannot be reviewed. */
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
