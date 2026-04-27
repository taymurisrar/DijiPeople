import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsObject()
  platformDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  billingDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  invoiceDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  publicPlanVisibility?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  emailProvider?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  featureCatalog?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  leadDefinitions?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  merge?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  changeReason?: string;
}
