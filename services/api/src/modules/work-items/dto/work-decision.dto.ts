import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

const MEETING_STATUSES = ['PLANNED', 'HELD', 'CANCELLED'];
const DECISION_STATUSES = ['PROPOSED', 'DECIDED', 'SUPERSEDED', 'REVERSED'];

export class CreateMeetingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  agenda?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  facilitatorEmployeeId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attendeeEmployeeIds?: string[];

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsUUID()
  blockerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

/**
 * Every field is optional; which of them may change depends on the meeting's status
 * (a held meeting accepts only notes, a cancelled one nothing).
 */
export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  agenda?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUUID()
  facilitatorEmployeeId?: string;

  /** The full set of invited people: it replaces the previous set. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attendeeEmployeeIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string;
}

export class HoldMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string;
}

export class CancelMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AttendanceEntryDto {
  @IsUUID()
  employeeId!: string;

  @IsBoolean()
  attended!: boolean;
}

export class RecordAttendanceDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}

export class ListMeetingsDto {
  @IsOptional()
  @IsIn(MEETING_STATUSES)
  status?: 'PLANNED' | 'HELD' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsUUID()
  blockerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class CreateDecisionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  decision!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  context?: string;

  @IsOptional()
  @IsIn(['PROPOSED', 'DECIDED'])
  status?: 'PROPOSED' | 'DECIDED';

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsUUID()
  blockerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

/** The new text. Anything left out carries over from the decision being replaced. */
export class SupersedeDecisionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  decision!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  context?: string;

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  meetingId?: string;
}

export class ReverseDecisionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AddDecisionActionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsUUID()
  ownerEmployeeId!: string;

  @IsDateString()
  dueAt!: string;
}

export class ListDecisionsDto {
  @IsOptional()
  @IsIn(DECISION_STATUSES)
  status?: 'PROPOSED' | 'DECIDED' | 'SUPERSEDED' | 'REVERSED';

  @IsOptional()
  @IsUUID()
  ownerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  meetingId?: string;

  @IsOptional()
  @IsUUID()
  workItemId?: string;

  @IsOptional()
  @IsUUID()
  blockerId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Decisions that I own. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
