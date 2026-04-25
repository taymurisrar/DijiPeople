import { Type } from 'class-transformer';
import { IsOptional, Max, Min } from 'class-validator';

export class GetMONTHLYTimesheetDto {
  @IsOptional()
  @Type(() => Number)
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(12)
  month?: number;
}
