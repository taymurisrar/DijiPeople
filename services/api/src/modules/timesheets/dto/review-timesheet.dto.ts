import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewTimesheetDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
