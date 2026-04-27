import {
  IsBoolean,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RegisterCandidateDocumentDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  kind?: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  storageKey?: string;

  @IsOptional()
  @IsBoolean()
  isPrimaryResume?: boolean;

  @IsOptional()
  @IsBoolean()
  isLatestResume?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parserVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  parsingStatus?: string;

  @IsOptional()
  @IsDecimal()
  extractionConfidence?: string;

  @IsOptional()
  parsingWarnings?: unknown;
}
