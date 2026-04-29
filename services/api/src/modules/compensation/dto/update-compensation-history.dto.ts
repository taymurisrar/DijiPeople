import {
  CompensationPayFrequency,
  EmployeeCompensationHistoryStatus,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCompensationHistoryDto {
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(CompensationPayFrequency)
  payFrequency?: CompensationPayFrequency;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @IsOptional()
  @IsNumberString()
  baseAmount?: string;

  @IsOptional()
  @IsEnum(EmployeeCompensationHistoryStatus)
  status?: EmployeeCompensationHistoryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
