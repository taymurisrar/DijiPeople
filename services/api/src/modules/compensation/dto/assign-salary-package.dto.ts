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
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AssignSalaryPackageDto {
  @IsUUID()
  salaryPackageRuleId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsEnum(CompensationPayFrequency)
  payFrequency?: CompensationPayFrequency;

  @IsOptional()
  @IsNumberString()
  baseAmount?: string;

  @IsOptional()
  @IsEnum(EmployeeCompensationHistoryStatus)
  status?: EmployeeCompensationHistoryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateCompensationRevisionDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsString()
  @MaxLength(1000)
  changeReason!: string;

  @IsOptional()
  @IsEnum(EmployeeCompensationHistoryStatus)
  status?: EmployeeCompensationHistoryStatus;
}
