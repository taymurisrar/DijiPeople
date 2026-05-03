import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import type { TenantSettingJsonInput } from './tenant-settings.repository';
import { FeatureAccessService } from './feature-access.service';
import {
  DEFAULT_TENANT_SETTINGS,
  TENANT_FEATURE_DEFINITIONS,
  TENANT_SETTING_CATEGORIES,
} from './tenant-settings.catalog';
import { TenantSettingsRepository } from './tenant-settings.repository';
import { TenantSettingsResolverService } from './tenant-settings-resolver.service';

type SettingsMap = Record<string, Record<string, Prisma.JsonValue>>;

type SettingsResponse = {
  settings: SettingsMap;
  categories: string[];
};

type JsonValueInput = TenantSettingJsonInput;

type NormalizedSettingUpdate = {
  category: string;
  key: string;
  value: JsonValueInput;
  actorUserId: string;
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
  'emailBrandColor',
  'pageGradientStartColor',
  'pageGradientEndColor',
  'cardGradientStartColor',
  'cardGradientEndColor',
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

    const settings = structuredClone(DEFAULT_TENANT_SETTINGS) as SettingsMap;

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
    const normalizedCategory = this.normalizeCategory(category);
    const settings = await this.getTenantSettings(tenantId);

    return {
      category: normalizedCategory,
      settings: settings.settings[normalizedCategory] ?? {},
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
    const normalizedTenantSlug = tenantSlug?.trim() || null;

    return this.tenantSettingsResolverService.getPublicBrandingByTenantSlug(
      normalizedTenantSlug,
    );
  }

  async updateTenantSettings(
    currentUser: AuthenticatedUser,
    dto: UpdateTenantSettingsDto,
  ) {
    if (!dto?.updates?.length) {
      throw new BadRequestException('No tenant setting updates were provided.');
    }

    const beforeSettings = await this.getTenantSettings(currentUser.tenantId);
    const allowedKeysByCategory =
      this.tenantSettingsResolverService.getAllowedKeysByCategory();

    const normalizedUpdates = this.normalizeSettingUpdates(
      currentUser,
      dto,
      allowedKeysByCategory,
    );

    const changedUpdates = normalizedUpdates.filter((update) => {
      const currentValue =
        beforeSettings.settings[update.category]?.[update.key] ?? null;

      return !areJsonValuesEqual(currentValue, update.value);
    });

    if (changedUpdates.length === 0) {
      return beforeSettings;
    }

    await this.tenantSettingsRepository.upsertSettings(
      currentUser.tenantId,
      changedUpdates,
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
      beforeSnapshot: pickSettingsSnapshot(
        beforeSettings.settings,
        changedUpdates,
      ),
      afterSnapshot: pickSettingsSnapshot(
        afterSettings.settings,
        changedUpdates,
      ),
    });

    return afterSettings;
  }

  async updateTenantSettingsCategory(
    currentUser: AuthenticatedUser,
    category: string,
    dto: UpdateTenantSettingsDto,
  ) {
    const normalizedCategory = this.normalizeCategory(category);

    if (!dto?.updates?.length) {
      throw new BadRequestException('No tenant setting updates were provided.');
    }

    const invalidCategoryUpdate = dto.updates.find(
      (item) => item.category?.trim() !== normalizedCategory,
    );

    if (invalidCategoryUpdate) {
      throw new BadRequestException(
        'Category-scoped updates must only include the requested category.',
      );
    }

    const updatedSettings = await this.updateTenantSettings(currentUser, dto);

    return {
      category: normalizedCategory,
      settings: updatedSettings.settings[normalizedCategory] ?? {},
    };
  }

  async getTenantFeatures(tenantId: string) {
    return this.featureAccessService.getResolvedTenantFeatures(tenantId);
  }

  async updateTenantFeatures(
    currentUser: AuthenticatedUser,
    dto: UpdateTenantFeaturesDto,
  ) {
    if (!dto?.updates?.length) {
      throw new BadRequestException('No tenant feature updates were provided.');
    }

    const beforeFeatures = await this.getTenantFeatures(currentUser.tenantId);

    const supportedFeatureKeys = new Set<string>(
      TENANT_FEATURE_DEFINITIONS.map((feature) => feature.key),
    );

    const updates = dto.updates.map((item) => ({
      key: item.key?.trim() ?? '',
      isEnabled: Boolean(item.isEnabled),
      actorUserId: currentUser.userId,
    }));

    const duplicateKey = findDuplicate(
      updates.map((item) => item.key).filter(Boolean),
    );

    if (duplicateKey) {
      throw new BadRequestException(
        `Duplicate feature update provided: ${duplicateKey}.`,
      );
    }

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

  private normalizeSettingUpdates(
    currentUser: AuthenticatedUser,
    dto: UpdateTenantSettingsDto,
    allowedKeysByCategory: Map<string, Set<string>>,
  ): NormalizedSettingUpdate[] {
    const seen = new Set<string>();

    return dto.updates.map((item) => {
      const category = this.normalizeCategory(item.category);
      const key = item.key?.trim();

      if (!key) {
        throw new BadRequestException('Setting keys cannot be empty.');
      }

      const compoundKey = `${category}.${key}`;

      if (seen.has(compoundKey)) {
        throw new BadRequestException(
          `Duplicate setting update provided: ${compoundKey}.`,
        );
      }

      seen.add(compoundKey);

      const allowedKeys = allowedKeysByCategory.get(category);

      if (!allowedKeys || !allowedKeys.has(key)) {
        throw new BadRequestException(
          `Unsupported setting key ${compoundKey}.`,
        );
      }

      return {
        category,
        key,
        value: normalizeSettingValue(category, key, item.value),
        actorUserId: currentUser.userId,
      };
    });
  }

  private normalizeCategory(category: string) {
    const normalizedCategory = category?.trim();

    if (!normalizedCategory) {
      throw new BadRequestException('Settings category cannot be empty.');
    }

    if (!TENANT_SETTING_CATEGORIES.includes(normalizedCategory as never)) {
      throw new BadRequestException(
        `Unsupported settings category: ${normalizedCategory}.`,
      );
    }

    return normalizedCategory;
  }
}

function normalizeSettingValue(
  category: string,
  key: string,
  value: unknown,
): JsonValueInput {
  const defaultCategory =
    DEFAULT_TENANT_SETTINGS[category as keyof typeof DEFAULT_TENANT_SETTINGS];

  const defaultValue = defaultCategory?.[key];

  if (defaultValue === undefined) {
    return toJsonValue(value);
  }

  if (typeof defaultValue === 'boolean') {
    return normalizeBooleanValue(category, key, value, defaultValue);
  }

  if (typeof defaultValue === 'number') {
    return normalizeNumberValue(category, key, value, defaultValue);
  }

  if (typeof defaultValue === 'string') {
    return normalizeStringValue(category, key, value, defaultValue);
  }

  if (Array.isArray(defaultValue)) {
    return normalizeArrayValue(category, key, value);
  }

  if (defaultValue === null) {
    return normalizeNullableValue(category, key, value);
  }

  return toJsonValue(value);
}

function normalizeBooleanValue(
  category: string,
  key: string,
  value: unknown,
  defaultValue: boolean,
) {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  throw new BadRequestException(
    `Setting ${category}.${key} must be a boolean value.`,
  );
}

function normalizeNumberValue(
  category: string,
  key: string,
  value: unknown,
  defaultValue: number,
) {
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

function normalizeStringValue(
  category: string,
  key: string,
  value: unknown,
  defaultValue: string,
) {
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
        `Setting ${category}.${key} must be a valid HEX color, for example #0f766e.`,
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

function normalizeArrayValue(
  category: string,
  key: string,
  value: unknown,
): JsonValueInput {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .sort();
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .sort();
  }

  throw new BadRequestException(
    `Setting ${category}.${key} must be an array value.`,
  );
}

function normalizeNullableValue(
  category: string,
  key: string,
  value: unknown,
): JsonValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return toJsonValue(value);
}

function toJsonValue(value: unknown): JsonValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry === null || entry === undefined) {
        return null;
      }

      if (
        typeof entry === 'string' ||
        typeof entry === 'number' ||
        typeof entry === 'boolean'
      ) {
        return entry;
      }

      return String(entry);
    });
  }

  if (typeof value === 'object') {
    return value as Prisma.InputJsonValue;
  }

  return String(value);
}

function areJsonValuesEqual(
  left: Prisma.JsonValue | null,
  right: JsonValueInput | null,
) {
  return (
    JSON.stringify(normalizeComparableValue(left)) ===
    JSON.stringify(normalizeComparableValue(right))
  );
}

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(String).sort();
  }

  return value;
}

function pickSettingsSnapshot(
  settings: SettingsMap,
  updates: NormalizedSettingUpdate[],
) {
  return updates.reduce<Record<string, Record<string, Prisma.JsonValue>>>(
    (snapshot, update) => {
      snapshot[update.category] = snapshot[update.category] ?? {};
      snapshot[update.category][update.key] =
        settings[update.category]?.[update.key] ?? null;

      return snapshot;
    },
    {},
  );
}

function findDuplicate(values: string[]) {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }

  return null;
}
