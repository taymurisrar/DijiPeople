import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';
import { LeadInquiryIntent } from '@prisma/client';

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
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'referralCode must be a valid referral code.',
  })
  referralCode?: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(100)
  firstName!: string;

  // Optional: a visitor with a single name is legitimate, and requiring a
  // surname is what made the form invent "Contact" as one — BUG-0021.
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(100)
  lastName?: string;

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

  // Optional since Wave 3. Both were required, so the contact form invented
  // values to satisfy them — BUG-0021. A field the form does not ask for must
  // not be mandatory at the boundary.
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(40)
  companySize?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  country?: string;

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
  interestArea?: string;


  /**
   * Why they are getting in touch. Validated against the enum, so a value the
   * database cannot store is rejected at the boundary rather than at insert.
   */
  @IsOptional()
  @IsEnum(LeadInquiryIntent)
  inquiryIntent?: LeadInquiryIntent;

  /**
   * Which capabilities interest them — module keys from the feature catalogue.
   *
   * Kept separate from `inquiryIntent`: "pricing" and "attendance, payroll"
   * answer different questions. Bounded so a public caller cannot post an
   * unbounded array. Membership is checked in the service against the live
   * catalogue rather than a copy frozen here.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  interestAreas?: string[];

  // --- Attribution -------------------------------------------------------
  // Captured by the page, not typed by the visitor. Every one is optional: an
  // absent UTM parameter means they arrived without one, and defaulting it
  // would corrupt campaign reporting.

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(200)
  sourcePage?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(500)
  referrerUrl?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  utmSource?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  utmMedium?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  utmContent?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  utmTerm?: string;

  // --- Consent -----------------------------------------------------------

  /**
   * Marketing consent. Optional, defaults to false, and never a condition of
   * submitting — a visitor must be able to ask a question without agreeing to
   * be marketed to.
   *
   * The privacy notice acknowledgement is NOT accepted from the client: the
   * server records which notice version was in force when it accepted the
   * submission. A client-supplied version could claim any notice at all.
   */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  website?: string;
}
