import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AssignProjectEmployeeDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleOnProject?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  allocationPercent?: number;

  @IsOptional()
  @IsBoolean()
  billableFlag?: boolean;
}
