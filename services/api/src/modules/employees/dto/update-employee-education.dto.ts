import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateEmployeeEducationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  institutionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  degreeTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fieldOfStudy?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  gradeOrCgpa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
