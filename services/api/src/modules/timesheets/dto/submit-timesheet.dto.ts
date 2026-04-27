import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitTimesheetDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  submittedNote?: string;
}
