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

  // `contentType` is deliberately absent. It was free text here and was written
  // straight onto the row that the download route sends as the response
  // Content-Type, with an inline disposition — so a recruiter could register
  // any stored bytes as `text/html` and have them execute in a colleague's
  // browser. It is now copied from the already-validated source Document.
  //
  // The global ValidationPipe runs with forbidNonWhitelisted, so a client still
  // sending the field gets a 400 rather than having it quietly ignored.

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
