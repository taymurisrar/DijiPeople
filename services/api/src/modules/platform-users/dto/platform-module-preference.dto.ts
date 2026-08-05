import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const PLATFORM_MODULE_KEYS = [
  'dashboard',
  'leads',
  'partners',
  'partner-inquiries',
  'customers',
  'partner-onboarding',
  'customer-onboarding',
  'tenants',
  'contracts',
  'contract-templates',
  'signature-requests',
  'support-cases',
  'subscriptions',
  'plans',
  'invoices',
  'payments',
  'commissions',
  'monitoring-incidents',
] as const;
export class PlatformModulePreferenceQueryDto {
  @IsIn(PLATFORM_MODULE_KEYS) moduleKey!: (typeof PLATFORM_MODULE_KEYS)[number];
}
export class UpdatePlatformModulePreferenceDto {
  @IsIn(PLATFORM_MODULE_KEYS) moduleKey!: (typeof PLATFORM_MODULE_KEYS)[number];
  @IsOptional() @IsString() @MaxLength(120) defaultViewKey?: string | null;
  @IsOptional() @IsString() @MaxLength(120) selectedViewKey?: string | null;
  @IsOptional() @IsObject() tableStateJson?: Record<string, unknown> | null;
  @IsOptional() @IsObject() dashboardLayoutJson?: Record<
    string,
    unknown
  > | null;
}
