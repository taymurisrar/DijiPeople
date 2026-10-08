import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  NUMBER_SEQUENCE_MAX_PADDING,
  NUMBER_SEQUENCE_MAX_VALUE,
  NUMBER_SEQUENCE_MIN_PADDING,
  NUMBER_SEQUENCE_PART_PATTERN,
} from './number-sequence-format';

const PART_MESSAGE =
  'Use up to 12 uppercase letters, digits or the characters - _ / .';

/**
 * `PATCH /super-admin/platform-settings/numbering/:key`.
 *
 * `key`, `label` and `resetPolicy` are not here: the first two identify the
 * concept and the third is fixed at NEVER (ADR-0027). The DTO bounds shape;
 * the raise-only rule needs the current row and lives in the service.
 */
export class UpdateNumberSequenceDto {
  @IsOptional()
  @IsString()
  @Matches(NUMBER_SEQUENCE_PART_PATTERN, { message: PART_MESSAGE })
  prefix?: string;

  @IsOptional()
  @IsString()
  @Matches(NUMBER_SEQUENCE_PART_PATTERN, { message: PART_MESSAGE })
  separator?: string;

  @IsOptional()
  @IsString()
  @Matches(NUMBER_SEQUENCE_PART_PATTERN, { message: PART_MESSAGE })
  suffix?: string;

  @IsOptional()
  @IsInt()
  @Min(NUMBER_SEQUENCE_MIN_PADDING)
  @Max(NUMBER_SEQUENCE_MAX_PADDING)
  padding?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(NUMBER_SEQUENCE_MAX_VALUE)
  nextValue?: number;
}
