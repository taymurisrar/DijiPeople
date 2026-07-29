import { CustomerStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  billingEmail?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(240)
  websiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  addressLine2?: string | null;

  @IsOptional()
  @IsUUID()
  cityId?: string | null;

  @IsOptional()
  @IsUUID()
  stateProvinceId?: string | null;

  @IsOptional()
  @IsUUID()
  countryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string | null;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
