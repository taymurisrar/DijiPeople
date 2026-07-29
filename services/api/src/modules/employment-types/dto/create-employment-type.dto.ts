import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEmploymentTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  payrollEligible?: boolean;

  @IsOptional()
  @IsBoolean()
  leaveEligible?: boolean;

  @IsOptional()
  @IsBoolean()
  overtimeEligible?: boolean;

  @IsOptional()
  @IsBoolean()
  benefitsEligible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultProbationDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
