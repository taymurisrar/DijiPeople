import {
  IsBoolean,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  /**
   * The `Document` row the upload endpoint (`POST /api/documents/upload`)
   * already created for this file. `storageKey` is deliberately NOT accepted
   * here (FILE-03): a client that merely knew a key used to be able to attach
   * anyone's stored file — including another tenant's — to a candidate
   * profile. The service resolves the real key server-side from this id,
   * after confirming the row belongs to this tenant and is already linked to
   * this exact candidate.
   */
  @IsOptional()
  @IsUUID()
  documentId?: string;

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
