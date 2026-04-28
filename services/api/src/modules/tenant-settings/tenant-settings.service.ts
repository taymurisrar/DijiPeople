import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { FeatureAccessService } from './feature-access.service';
import { TenantSettingsResolverService } from './tenant-settings-resolver.service';
import { TenantSettingsRepository } from './tenant-settings.repository';
import {
  DEFAULT_TENANT_SETTINGS,
  TENANT_FEATURE_DEFINITIONS,
  TENANT_SETTING_CATEGORIES,
} from './tenant-settings.catalog';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

type SettingsResponse = {
  settings: Record<string, Record<string, Prisma.JsonValue>>;
  categories: string[];
};

const BRANDING_COLOR_KEYS = new Set<string>([
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
  'appBackgroundColor',
  'appSurfaceColor',
]);

const BRANDING_FONT_VALUES = new Set<string>([
  'INTER',
  'ROBOTO',
  'OPEN_SANS',
  'LATO',
  'POPPINS',
  'MONTSERRAT',
  'NUNITO',
  'SOURCE_SANS_3',
]);

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly tenantSettingsRepository: TenantSettingsRepository,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly featureAccessService: FeatureAccessService,
    private readonly auditService: AuditService,
  ) {}

  async getTenantSettings(tenantId: string): Promise<SettingsResponse> {
    const persistedSettings =
      await this.tenantSettingsRepository.findSettingsByTenant(tenantId);

    const settings = structuredClone(DEFAULT_TENANT_SETTINGS) as Record<
      string,
      Record<string, Prisma.JsonValue>
    >;

    for (const item of persistedSettings) {
      if (!settings[item.category]) {
        settings[item.category] = {};
      }

      settings[item.category][item.key] = item.value;
    }

    return {
      settings,
      categories: [...TENANT_SETTING_CATEGORIES],
    };
  }

  async getTenantSettingsCategory(tenantId: string, category: string) {
    this.assertValidCategory(category);
    const settings = await this.getTenantSettings(tenantId);

    return {
      category,
      settings: settings.settings[category] ?? {},
    };
  }

  async getResolvedSettings(tenantId: string) {
    const [
      organization,
      employee,
      attendance,
      timesheets,
      payroll,
      recruitment,
      documents,
      notifications,
      branding,
      system,
    ] = await Promise.all([
      this.tenantSettingsResolverService.getOrganizationSettings(tenantId),
      this.tenantSettingsResolverService.getEmployeeSettings(tenantId),
      this.tenantSettingsResolverService.getAttendanceSettings(tenantId),
      this.tenantSettingsResolverService.getTimesheetSettings(tenantId),
      this.tenantSettingsResolverService.getPayrollSettings(tenantId),
      this.tenantSettingsResolverService.getRecruitmentSettings(tenantId),
      this.tenantSettingsResolverService.getDocumentSettings(tenantId),
      this.tenantSettingsResolverService.getNotificationSettings(tenantId),
      this.tenantSettingsResolverService.getBrandingSettings(tenantId),
      this.tenantSettingsResolverService.getSystemSettings(tenantId),
    ]);

    return {
      organization,
      employee,
      attendance,
      timesheets,
      payroll,
      recruitment,
      documents,
      notifications,
      branding,
      system,
    };
  }

  getPublicBranding(tenantSlug?: string | null) {
    return this.tenantSettingsResolverService.getPublicBrandingByTenantSlug(
      tenantSlug,
    );
  }

  async updateTenantSettings(
    currentUser: AuthenticatedUser,
    dto: UpdateTenantSettingsDto,
  ) {
    const beforeSettings = await this.getTenantSettings(currentUser.tenantId);
    const allowedKeysByCategory =
      this.tenantSettingsResolverService.getAllowedKeysByCategory();
    const updates = dto.updates.map((item) => ({
      category: item.category.trim(),
      key: item.key.trim(),
      value: item.value,
      actorUserId: currentUser.userId,
    }));

    const invalidKey = updates.find((item) => item.key.length === 0);

    if (invalidKey) {
      throw new BadRequestException('Setting keys cannot be empty.');
    }

    const unsupportedUpdate = updates.find((item) => {
      const allowedKeys = allowedKeysByCategory.get(item.category as never);
      return !allowedKeys || !allowedKeys.has(item.key);
    });

    if (unsupportedUpdate) {
      throw new BadRequestException(
        `Unsupported setting key ${unsupportedUpdate.category}.${unsupportedUpdate.key}.`,
      );
    }

    const typedUpdates = updates.map((item) => ({
      ...item,
      value: normalizeSettingValue(item.category, item.key, item.value),
    }));

    await this.tenantSettingsRepository.upsertSettings(
      currentUser.tenantId,
      typedUpdates,
    );
    this.tenantSettingsResolverService.invalidateTenantCache(
      currentUser.tenantId,
    );

    const afterSettings = await this.getTenantSettings(currentUser.tenantId);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TENANT_SETTINGS_UPDATED',
      entityType: 'TenantSetting',
      entityId: currentUser.tenantId,
      beforeSnapshot: beforeSettings,
      afterSnapshot: afterSettings,
    });

    return afterSettings;
  }

  async updateTenantSettingsCategory(
    currentUser: AuthenticatedUser,
    category: string,
    dto: UpdateTenantSettingsDto,
  ) {
    this.assertValidCategory(category);

    const invalidCategoryUpdate = dto.updates.find(
      (item) => item.category !== category,
    );

    if (invalidCategoryUpdate) {
      throw new BadRequestException(
        'Category-scoped updates must only include the requested category.',
      );
    }

    const updatedSettings = await this.updateTenantSettings(currentUser, dto);

    return {
      category,
      settings: updatedSettings.settings[category] ?? {},
    };
  }

  async getTenantFeatures(tenantId: string) {
    return this.featureAccessService.getResolvedTenantFeatures(tenantId);
  }

  async updateTenantFeatures(
    currentUser: AuthenticatedUser,
    dto: UpdateTenantFeaturesDto,
  ) {
    const beforeFeatures = await this.getTenantFeatures(currentUser.tenantId);
    const supportedFeatureKeys = new Set<string>(
      TENANT_FEATURE_DEFINITIONS.map((feature) => feature.key),
    );

    const updates = dto.updates.map((item) => ({
      key: item.key.trim(),
      isEnabled: item.isEnabled,
      actorUserId: currentUser.userId,
    }));

    const invalidFeature = updates.find(
      (item) => item.key.length === 0 || !supportedFeatureKeys.has(item.key),
    );

    if (invalidFeature) {
      throw new BadRequestException(
        `Unsupported feature key: ${invalidFeature.key || '(empty)'}.`,
      );
    }

    const resolvedFeatures =
      await this.featureAccessService.getResolvedTenantFeatures(
        currentUser.tenantId,
      );
    const includedByPlan = new Set<string>(
      resolvedFeatures.items
        .filter((feature) => feature.isIncludedInPlan)
        .map((feature) => feature.key),
    );

    const disallowedEnable = updates.find(
      (item) => item.isEnabled && !includedByPlan.has(item.key),
    );

    if (disallowedEnable) {
      throw new BadRequestException(
        `Feature ${disallowedEnable.key} is not available on the current subscription plan.`,
      );
    }

    await this.tenantSettingsRepository.upsertFeatures(
      currentUser.tenantId,
      updates,
    );
    this.tenantSettingsResolverService.invalidateTenantCache(
      currentUser.tenantId,
    );

    const afterFeatures = await this.getTenantFeatures(currentUser.tenantId);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'TENANT_FEATURES_UPDATED',
      entityType: 'TenantFeature',
      entityId: currentUser.tenantId,
      beforeSnapshot: beforeFeatures,
      afterSnapshot: afterFeatures,
    });

    return afterFeatures;
  }

  private assertValidCategory(category: string) {
    if (!TENANT_SETTING_CATEGORIES.includes(category as never)) {
      throw new BadRequestException(
        `Unsupported settings category: ${category}.`,
      );
    }
  }
}

function normalizeSettingValue(category: string, key: string, value: unknown) {
  const defaultCategory =
    DEFAULT_TENANT_SETTINGS[category as keyof typeof DEFAULT_TENANT_SETTINGS];
  const defaultValue = defaultCategory?.[key];

  if (defaultValue === undefined) {
    return value as Prisma.InputJsonValue;
  }

  if (typeof defaultValue === 'boolean') {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    throw new BadRequestException(
      `Setting ${category}.${key} must be a boolean value.`,
    );
  }

  if (typeof defaultValue === 'number') {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim().length === 0)
    ) {
      return defaultValue;
    }

    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(
        `Setting ${category}.${key} must be a valid number.`,
      );
    }
    return numeric;
  }

  if (typeof defaultValue === 'string') {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        `Setting ${category}.${key} must be a string value.`,
      );
    }

    const normalizedValue = value.trim();

    if (category === 'branding' && BRANDING_COLOR_KEYS.has(key)) {
      if (normalizedValue.length === 0) {
        return defaultValue;
      }

      if (!HEX_COLOR_PATTERN.test(normalizedValue)) {
        throw new BadRequestException(
          `Setting ${category}.${key} must be a valid HEX color (for example #0f766e).`,
        );
      }
    }

    if (category === 'branding' && key === 'fontFamily') {
      if (normalizedValue.length === 0) {
        return defaultValue;
      }

      const normalizedFont = normalizedValue.toUpperCase();
      if (!BRANDING_FONT_VALUES.has(normalizedFont)) {
        throw new BadRequestException(
          `Setting ${category}.${key} is not supported.`,
        );
      }
      return normalizedFont;
    }

    return normalizedValue;
  }

  if (defaultValue === null) {
    if (value === null || typeof value === 'string') {
      return value as Prisma.InputJsonValue;
    }
    throw new BadRequestException(
      `Setting ${category}.${key} must be null or a string value.`,
    );
  }

  return value as Prisma.InputJsonValue;
}
