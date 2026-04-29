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

export class CreateCompensationHistoryDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsEnum(CompensationPayFrequency)
  payFrequency!: CompensationPayFrequency;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsNumberString()
  baseAmount!: string;

  @IsOptional()
  @IsEnum(EmployeeCompensationHistoryStatus)
  status?: EmployeeCompensationHistoryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
