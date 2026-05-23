import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

function trimToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEmail({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export class PublicSubscribeDto {
  @IsUUID()
  planPriceId!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  contactName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(40)
  @Matches(/^[+()\-.\s0-9]{7,40}$/, {
    message: 'phone must be a valid business phone number.',
  })
  phone?: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  country!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(1500)
  message?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  website?: string;
}
