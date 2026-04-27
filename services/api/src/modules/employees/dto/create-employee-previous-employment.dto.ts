import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
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

export class CreateEmployeePreviousEmploymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  companyName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  jobTitle!: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(60)
  employmentType?: string;

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
  @Matches(/^\d+(\.\d{1,2})?$/)
  finalSalary?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  reasonForLeaving?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  referenceName?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  referenceContact?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
