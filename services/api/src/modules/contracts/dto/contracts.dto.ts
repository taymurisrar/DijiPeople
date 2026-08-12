import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ContractDocumentSource,
  ContractFieldType,
  ContractPartyRole,
  ContractPartyType,
  ContractSigningMode,
  ContractStatus,
  ContractType,
  SignatureMethod,
} from '@prisma/client';
import { AGREEMENT_CATEGORY_VALUES } from '@repo/config';

export class ContractQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @IsOptional() @IsString() viewKey?: string;
  @IsOptional() @IsString() ownerPlatformUserId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() filters?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() fields?: string;
}

export class CreateContractTemplateDto {
  @IsString() @MaxLength(80) key!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsEnum(ContractType) contractType!: ContractType;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsString() @MaxLength(240) title!: string;
  @IsString() contentHtml!: string;
  @IsOptional() @IsString() contentText?: string;
  @IsOptional() @IsArray() placeholders?: Array<Record<string, unknown>>;
  @IsOptional() @IsBoolean() publish?: boolean;
  @IsOptional()
  @IsEnum(ContractDocumentSource)
  documentMode?: ContractDocumentSource;
  @IsOptional() @IsEnum(ContractSigningMode) signingMode?: ContractSigningMode;
  @IsOptional() @IsString() @MaxLength(120) lifecycleGatePurpose?: string;
  @IsOptional() @IsArray() fieldDefinitions?: Array<Record<string, unknown>>;
  @IsOptional() @IsArray() partyDefinitions?: Array<Record<string, unknown>>;
  @IsOptional() @IsObject() signingConfig?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(1000) changeSummary?: string;
}

export class CreateContractTemplateVersionDto {
  @IsString() @MaxLength(240) title!: string;
  @IsString() contentHtml!: string;
  @IsOptional() @IsString() contentText?: string;
  @IsOptional() @IsArray() placeholders?: Array<Record<string, unknown>>;
  @IsOptional() @IsString() @MaxLength(1000) changeSummary?: string;
  @IsOptional() @IsBoolean() publish?: boolean;
  @IsOptional() @IsString() @MaxLength(120) lifecycleGatePurpose?: string;
  @IsOptional() @IsArray() fieldDefinitions?: Array<Record<string, unknown>>;
  @IsOptional() @IsArray() partyDefinitions?: Array<Record<string, unknown>>;
  @IsOptional() @IsObject() signingConfig?: Record<string, unknown>;
}

export class ContractPartyDto {
  @IsEnum(ContractPartyType) partyType!: ContractPartyType;
  @IsEnum(ContractPartyRole) role!: ContractPartyRole;
  @IsString() @MaxLength(240) name!: string;
  @IsOptional() @IsString() @MaxLength(240) legalName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) organizationId?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isSignatory?: boolean;
  @IsOptional() @IsBoolean() signatureRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) signingOrder?: number;
}

export class UpdateContractPartyDto {
  @IsOptional() @IsEnum(ContractPartyType) partyType?: ContractPartyType;
  @IsOptional() @IsEnum(ContractPartyRole) role?: ContractPartyRole;
  @IsOptional() @IsString() @MaxLength(240) name?: string;
  @IsOptional() @IsString() @MaxLength(240) legalName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) organizationId?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isSignatory?: boolean;
  @IsOptional() @IsBoolean() signatureRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) signingOrder?: number;
}

export class ContractRelatedRecordDto {
  @IsString() @MaxLength(80) entityType!: string;
  @IsString() @MaxLength(120) entityId!: string;
  @IsOptional() @IsString() @MaxLength(80) relationshipType?: string;
}

export class ContractFieldPlacementDto {
  @IsUUID() contractVersionId!: string;
  @IsOptional() @IsUUID() partyId?: string;
  @IsOptional() @IsUUID() recipientId?: string;
  @IsString() @MaxLength(120) fieldKey!: string;
  @IsEnum(ContractFieldType) fieldType!: ContractFieldType;
  @Type(() => Number) @IsInt() @Min(1) pageNumber!: number;
  @Type(() => Number) @IsNumber() @Min(0) x!: number;
  @Type(() => Number) @IsNumber() @Min(0) y!: number;
  @Type(() => Number) @IsNumber() @Min(0) width!: number;
  @Type(() => Number) @IsNumber() @Min(0) height!: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(500) defaultValue?: string;
}

export class UpdateContractTemplateStateDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  state!: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export class CreateContractDto {
  @IsString() @MaxLength(240) title!: string;
  @IsEnum(ContractType) contractType!: ContractType;
  @IsString() @MaxLength(240) counterpartyName!: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() customerOnboardingId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() relatedLeadId?: string;
  @IsOptional() @IsUUID() ownerPlatformUserId?: string;
  @IsOptional() @IsUUID() internalLegalOwnerId?: string;
  @IsOptional() @IsUUID() parentContractId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amendmentNumber?: number;
  @IsOptional()
  @IsString()
  @IsIn(AGREEMENT_CATEGORY_VALUES)
  agreementCategory?: string;
  @IsOptional() @IsString() @MaxLength(80) counterpartyType?: string;
  @IsOptional()
  @IsEnum(ContractDocumentSource)
  documentSource?: ContractDocumentSource;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) contractValue?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;
  @IsOptional() @IsString() @MaxLength(120) commissionBasis?: string;
  @IsOptional() @IsString() @MaxLength(500) paymentTerms?: string;
  @IsOptional() @IsString() @MaxLength(240) governingLaw?: string;
  @IsOptional() @IsString() @MaxLength(240) jurisdiction?: string;
  @IsOptional() @IsString() @MaxLength(80) confidentialityClass?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsBoolean() autoRenewal?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) renewalNoticeDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  terminationNoticeDays?: number;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() contentHtml?: string;
  @IsOptional() @IsObject() placeholderValues?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(120) lifecycleGatePurpose?: string;
  @IsOptional() @IsBoolean() isGoverningAgreement?: boolean;
  @IsOptional() @IsBoolean() allowChangeRequests?: boolean;
  @IsOptional() @IsEnum(ContractSigningMode) signingMode?: ContractSigningMode;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
  @IsOptional() @IsUUID() amendsContractId?: string;
  @IsOptional() @IsUUID() renewsContractId?: string;
  @IsOptional() @IsUUID() supersedesContractId?: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractPartyDto)
  parties?: ContractPartyDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractRelatedRecordDto)
  relatedRecords?: ContractRelatedRecordDto[];
}

export class CreateContractFromSourceDto {
  @IsIn(['lead', 'customer', 'onboarding', 'tenant']) sourceType!:
    | 'lead'
    | 'customer'
    | 'onboarding'
    | 'tenant';
  @IsUUID() sourceId!: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class CopyContractDto {
  @IsUUID() sourceContractId!: string;
  @IsString() @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(240) counterpartyName?: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
}

export class CreateUploadedContractDto {
  @IsString() @MaxLength(240) title!: string;
  @IsEnum(ContractType) contractType!: ContractType;
  @IsString() @MaxLength(240) counterpartyName!: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() customerOnboardingId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
}

export class UpdateContractDto {
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() customerOnboardingId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() relatedLeadId?: string;
  @IsOptional() @IsString() @MaxLength(240) counterpartyName?: string;
  @IsOptional() @IsEmail() counterpartyEmail?: string;
  @IsOptional() @IsUUID() ownerPlatformUserId?: string;
  @IsOptional() @IsUUID() internalLegalOwnerId?: string;
  @IsOptional() @IsUUID() parentContractId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) amendmentNumber?: number;
  @IsOptional()
  @IsString()
  @IsIn(AGREEMENT_CATEGORY_VALUES)
  agreementCategory?: string;
  @IsOptional() @IsString() @MaxLength(120) lifecycleGatePurpose?: string;
  @IsOptional() @IsBoolean() isGoverningAgreement?: boolean;
  @IsOptional() @IsBoolean() allowChangeRequests?: boolean;
  @IsOptional() @IsEnum(ContractSigningMode) signingMode?: ContractSigningMode;
  @IsOptional() @IsString() @MaxLength(80) counterpartyType?: string;
  @IsOptional()
  @IsEnum(ContractDocumentSource)
  documentSource?: ContractDocumentSource;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) contractValue?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;
  @IsOptional() @IsString() @MaxLength(120) commissionBasis?: string;
  @IsOptional() @IsString() @MaxLength(500) paymentTerms?: string;
  @IsOptional() @IsString() @MaxLength(240) governingLaw?: string;
  @IsOptional() @IsString() @MaxLength(240) jurisdiction?: string;
  @IsOptional() @IsString() @MaxLength(80) confidentialityClass?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
  @IsOptional() @IsBoolean() autoRenewal?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) renewalNoticeDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  terminationNoticeDays?: number;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsUUID() amendsContractId?: string;
  @IsOptional() @IsUUID() renewsContractId?: string;
  @IsOptional() @IsUUID() supersedesContractId?: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
}

export class SaveContractVersionDto {
  @IsString() contentHtml!: string;
  @IsOptional() @IsString() contentText?: string;
  @IsOptional() @IsString() @MaxLength(1000) changeSummary?: string;
  @IsOptional() @IsObject() placeholderValues?: Record<string, string>;
}

export class ApprovalDecisionDto {
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ContractStageTransitionDto {
  @IsIn(['forward', 'backward'])
  direction!: 'forward' | 'backward';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class SignatureRecipientDto {
  @IsString() @MaxLength(160) name!: string;
  @IsEmail() email!: string;
  @IsString() @MaxLength(80) role!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) signingOrder = 1;
  @IsOptional() @IsUUID() partyId?: string;
  @IsOptional() @IsBoolean() isRequired = true;
}

export class SendSignatureRequestDto {
  @IsString() @MaxLength(240) subject!: string;
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SignatureRecipientDto)
  recipients!: SignatureRecipientDto[];
  @IsOptional() @IsEnum(ContractSigningMode) signingMode?: ContractSigningMode;
  @IsOptional() @IsBoolean() allowChangeRequests?: boolean;
}

export class ContractReasonDto {
  @IsString() @MaxLength(2000) reason!: string;
}

export class CreateDerivedContractDto {
  @IsString() @MaxLength(240) title!: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
  @IsOptional() @IsString() contentHtml?: string;
}

export class CompleteSignatureDto {
  @IsEnum(SignatureMethod) method!: SignatureMethod;
  @IsOptional() @IsString() @MaxLength(200) typedName?: string;
  @IsOptional() @IsString() signatureDataUrl?: string;
  @IsBoolean() consentAccepted!: boolean;
  @IsString() @MaxLength(2000) consentText!: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
}

export class DeclineSignatureDto {
  @IsString() @MaxLength(2000) reason!: string;
}

export class RequestSignatureChangesDto {
  @IsString() @MaxLength(2000) reason!: string;
}
