import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

function emptyStringToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class UpdateAddressDto {
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  stateProvinceId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(30)
  postalCode?: string;
}
