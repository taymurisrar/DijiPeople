import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class CreateEmployeeEducationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  institutionName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  degreeTitle!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(160)
  fieldOfStudy?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(60)
  gradeOrCgpa?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(500)
  description?: string;
}
