import { JobOpeningStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JobOpeningMatchCriteriaDto } from './job-opening-match-criteria.dto';

export class CreateJobOpeningDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsEnum(JobOpeningStatus)
  status?: JobOpeningStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => JobOpeningMatchCriteriaDto)
  matchCriteria?: JobOpeningMatchCriteriaDto;
}
