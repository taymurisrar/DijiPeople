import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

function trimToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEmail({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim().toLowerCase();
}

export class SubmitLeadDto {
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  workEmail!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(40)
  @Matches(/^[+()\-.\s0-9]{7,40}$/, {
    message: 'phoneNumber must be a valid business phone number.',
  })
  phoneNumber?: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  industry!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(40)
  companySize!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(1500)
  message?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  interestedPlan?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  website?: string;
}
