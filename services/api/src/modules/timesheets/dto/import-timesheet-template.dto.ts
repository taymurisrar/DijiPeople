import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ImportTimesheetTemplateDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  scope?: 'mine' | 'team' | 'tenant';

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;
}

export class CommitTimesheetImportDto {
  @IsUUID()
  batchId!: string;
}
