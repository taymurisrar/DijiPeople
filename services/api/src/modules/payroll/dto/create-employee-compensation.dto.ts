import { PayFrequency } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateEmployeeCompensationDto {
  @IsUUID()
  employeeId!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'basicSalary must be a valid monetary amount.',
  })
  basicSalary!: string;

  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @MaxLength(3)
  currency?: string;
}
