import { BusinessTripStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class BusinessTripQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(BusinessTripStatus)
  status?: BusinessTripStatus;
}

export class CreateBusinessTripDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  originCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  originCity?: string;

  @IsString()
  @MaxLength(80)
  destinationCountry!: string;

  @IsString()
  @MaxLength(120)
  destinationCity!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;
}

export class UpdateBusinessTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  originCountry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  originCity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  destinationCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  destinationCity?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;
}

export class BusinessTripActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

export class RejectBusinessTripDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
