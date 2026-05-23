import { IsString, MaxLength } from 'class-validator';
import { UpdateManualAttendanceEntryDto } from './update-manual-attendance-entry.dto';

export class OverrideAttendanceEntryDto extends UpdateManualAttendanceEntryDto {
  @IsString()
  @MaxLength(1000)
  adjustmentReason!: string;
}
