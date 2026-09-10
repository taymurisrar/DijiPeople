import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * BUG-2573. Deliberately narrower than {@link AttendanceCorrectionActionDto}:
 * withdrawing a request is not a decision about what it should have said, so
 * there is no requested-time override here — only an optional note from the
 * person taking it back.
 */
export class AttendanceCorrectionCancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
