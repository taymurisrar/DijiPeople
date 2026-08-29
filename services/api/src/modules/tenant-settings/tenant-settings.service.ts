import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import {
  ENTITY_KEYS,
  SECURITY_ACCESS_LEVEL_WEIGHT,
} from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import { AuditService } from '../audit/audit.service';
import { PublicTenantCacheService } from '../tenants/public-tenant-cache.service';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import type { TenantSettingJsonInput } from './tenant-settings.repository';
import { FeatureAccessService } from './feature-access.service';
import {
  DEFAULT_TENANT_SETTINGS,
  TENANT_FEATURE_DEFINITIONS,
  TENANT_SETTING_CATEGORIES,
} from './tenant-settings.catalog';
import { describeInertTenantSettingKeys } from './tenant-settings-dispositions';
import { TenantSettingsRepository } from './tenant-settings.repository';
import { TenantSettingsResolverService } from './tenant-settings-resolver.service';
import { ActiveOrganizationService } from './active-organization.service';
import { toDisplayString } from '../../common/utils/display-string';

type SettingsMap = Record<string, Record<string, Prisma.JsonValue>>;

type SettingsResponse = {
  settings: SettingsMap;
  tenant?: { id: string; name: string; slug: string } | null;
  categories: string[];
  /**
   * The keys in `settings` that the platform declares but does not honour.
   *
   * BUG-1974: 246 of 591 declared keys had no reader anywhere, and the write
   * path treated them as first-class — validated, stored, cached, audited and
   * echoed back. A client had no way to tell them from the ones that work. It
   * still gets the keys, so nothing that already stores a value breaks, but it
   * is now told which ones are inert instead of inferring it from behaviour
   * that never changes.
   */
  inertKeys: ReturnType<typeof describeInertTenantSettingKeys>;
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
  'mutedTextColor',
  'borderColor',
  'sidebarBackgroundColor',
  'sidebarTextColor',
  'sidebarActiveBackgroundColor',
  'sidebarActiveTextColor',
  'successColor',
  'warningColor',
  'dangerColor',
  'infoColor',
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
const MULTI_VALUE_SETTING_KEYS = new Set<string>([
  'attendance.allowedModes',
  'attendance.locationRequiredForModes',
  'timesheets.weekendDays',
  'documents.allowedExtensions',
]);
@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly tenantSettingsRepository: TenantSettingsRepository,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly featureAccessService: FeatureAccessService,
    private readonly auditService: AuditService,
    private readonly publicTenantCacheService: PublicTenantCacheService,
    private readonly activeOrganizationService: ActiveOrganizationService,
  ) {}

  async getResolvedSettingsForUser(
    currentUser: AuthenticatedUser,
    requestedOrganizationId?: string,
  ) {
    const ownOrganizationId =
      await this.activeOrganizationService.resolveForUser(
        currentUser.tenantId,
        currentUser.userId,
      );
    const requested = requestedOrganizationId?.trim();
    let organizationId = ownOrganizationId;

    if (requested && requested !== ownOrganizationId) {
      const accessLevel = resolveEffectiveAccessLevel(
        currentUser,
        ENTITY_KEYS.SETTINGS,
        SecurityPrivilege.READ,
      );
      const canPreviewOrganization =
        SECURITY_ACCESS_LEVEL_WEIGHT[accessLevel] >=
          SECURITY_ACCESS_LEVEL_WEIGHT[SecurityAccessLevel.ORGANIZATION] &&
        (accessLevel === SecurityAccessLevel.TENANT ||
          requested === currentUser.accessContext?.organizationId);

      if (!canPreviewOrganization) {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'You do not have permission to preview this organization.',
        });
      }

      organizationId = await this.assertOrganizationInTenant(
        currentUser.tenantId,
        requested,
      );
    }

    return this.getResolvedSettings(currentUser.tenantId, organizationId);
  }

  async getTenantSettings(tenantId: string): Promise<SettingsResponse> {
    const [tenant, persistedSettings] = await Promise.all([
      this.tenantSettingsRepository.findTenantById(tenantId),
      this.tenantSettingsRepository.findSettingsByTenant(tenantId),
    ]);

    const settings = structuredClone(DEFAULT_TENANT_SETTINGS) as SettingsMap;

    for (const item of persistedSettings) {
      if (!settings[item.category]) {
        settings[item.category] = {};
      }

      settings[item.category][item.key] = item.value;
    }

    if (tenant) {
      settings.organization.tenantDisplayName = tenant.name;
      settings.organization.companyDisplayName =
        settings.organization.companyDisplayName || tenant.name;
      settings.branding.brandName = settings.branding.brandName || tenant.name;
    }

    return {
      settings,
      tenant,
      categories: [...TENANT_SETTING_CATEGORIES],
      inertKeys: describeInertTenantSettingKeys(),
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

  /**
   * `organizationId` layers that organization's overrides on top of the tenant
   * values. Callers pass the signed-in user's organization so a tenant running
   * several organizations serves each its own branding.
   */
  async getResolvedSettings(tenantId: string, organizationId?: string) {
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
      security,
      system,
    ] = await Promise.all([
      this.tenantSettingsResolverService.getOrganizationSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getEmployeeSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getAttendanceSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getTimesheetSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getPayrollSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getRecruitmentSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getDocumentSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getNotificationSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getBrandingSettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getSecuritySettings(
        tenantId,
        organizationId,
      ),
      this.tenantSettingsResolverService.getSystemSettings(
        tenantId,
        organizationId,
      ),
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
      security,
      system,
      activeOrganizationId: organizationId ?? null,
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
    const tenantProfileChanged = await this.applyTenantProfileUpdates(
      currentUser,
      normalizedUpdates,
    );

    const changedUpdates = normalizedUpdates.filter((update) => {
      const currentValue =
        beforeSettings.settings[update.category]?.[update.key] ?? null;

      return !areJsonValuesEqual(currentValue, update.value);
    });

    if (changedUpdates.length === 0 && !tenantProfileChanged) {
      return beforeSettings;
    }

    if (changedUpdates.length > 0) {
      await this.tenantSettingsRepository.upsertSettings(
        currentUser.tenantId,
        changedUpdates,
      );
      await this.syncTenantBrandingModel(currentUser.tenantId, changedUpdates);
    }

    this.tenantSettingsResolverService.invalidateTenantCache(
      currentUser.tenantId,
    );
    this.invalidatePublicTenantCacheIfNeeded(
      currentUser.tenantId,
      tenantProfileChanged,
      changedUpdates,
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

  /**
   * Categories an organization may override. Branding carries colours, fonts,
   * density and layout, so this covers both branding and appearance. The store
   * itself is category-agnostic, so widening this list is the only change
   * needed to scope more categories later.
   */
  private static readonly ORGANIZATION_SCOPED_CATEGORIES = new Set([
    'branding',
  ]);

  getBrandableOrganizations(tenantId: string) {
    return this.tenantSettingsRepository.findOrganizationsByTenant(tenantId);
  }

  async assertOrganizationInTenant(tenantId: string, organizationId: string) {
    const organization =
      await this.tenantSettingsRepository.findOrganizationById(
        tenantId,
        organizationId,
      );

    if (!organization) {
      throw new BadRequestException(
        'Selected organization does not belong to this tenant.',
      );
    }

    return organization.id;
  }

  /** Returns only the keys this organization overrides, not the merged view. */
  async getOrganizationSettingOverrides(
    tenantId: string,
    organizationId: string,
  ) {
    await this.assertOrganizationInTenant(tenantId, organizationId);

    const rows = await this.tenantSettingsRepository.findSettingsByOrganization(
      tenantId,
      organizationId,
    );

    const overrides: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      overrides[row.category] ??= {};
      overrides[row.category][row.key] = row.value;
    }

    return { organizationId, overrides };
  }

  async updateOrganizationSettings(
    currentUser: AuthenticatedUser,
    organizationId: string,
    dto: UpdateTenantSettingsDto,
  ) {
    if (!dto?.updates?.length) {
      throw new BadRequestException(
        'No organization setting updates were provided.',
      );
    }

    await this.assertOrganizationInTenant(currentUser.tenantId, organizationId);

    const unsupported = dto.updates.find(
      (update) =>
        !TenantSettingsService.ORGANIZATION_SCOPED_CATEGORIES.has(
          update.category,
        ),
    );

    if (unsupported) {
      throw new BadRequestException(
        `Settings in "${unsupported.category}" cannot be scoped to an organization.`,
      );
    }

    const allowedKeysByCategory =
      this.tenantSettingsResolverService.getAllowedKeysByCategory();
    const normalizedUpdates = this.normalizeSettingUpdates(
      currentUser,
      dto,
      allowedKeysByCategory,
    );

    // A blank value clears the override so the tenant value applies again,
    // which is how an organization returns to inheriting.
    const cleared = normalizedUpdates.filter(
      (update) =>
        update.value === null ||
        update.value === Prisma.JsonNull ||
        (typeof update.value === 'string' && update.value.trim() === ''),
    );
    const applied = normalizedUpdates.filter(
      (update) => !cleared.includes(update),
    );

    await this.tenantSettingsRepository.upsertOrganizationSettings(
      currentUser.tenantId,
      organizationId,
      applied,
    );
    await this.tenantSettingsRepository.deleteOrganizationSettings(
      currentUser.tenantId,
      organizationId,
      cleared.map(({ category, key }) => ({ category, key })),
    );

    this.tenantSettingsResolverService.invalidateTenantCache(
      currentUser.tenantId,
    );

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      entityType: 'OrganizationSetting',
      entityId: organizationId,
      beforeSnapshot: null,
      afterSnapshot: {
        organizationId,
        applied: applied.map(({ category, key }) => `${category}.${key}`),
        cleared: cleared.map(({ category, key }) => `${category}.${key}`),
      },
      sourceModule: 'tenant-settings',
    });

    return this.getOrganizationSettingOverrides(
      currentUser.tenantId,
      organizationId,
    );
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

      const normalizedValue = normalizeSettingValue(category, key, item.value);

      /*
       * Reported, then still enforced.
       *
       * The refusal below is the disclosure half: a submitted value that will
       * not be honoured now fails the request and names the key, instead of
       * being swapped for the mandated one so quietly that the change-diff
       * dropped it as a no-op and the audit row recorded nothing (BUG-1979).
       * `enforceCriticalAttendanceSetting` is kept underneath it deliberately -
       * it is the lock, and a future caller that reaches this map by another
       * route must not be able to write past the mandate.
       */
      assertAttendanceSettingIsChangeable(category, key, normalizedValue);

      return {
        category,
        key,
        value: enforceCriticalAttendanceSetting(category, key, normalizedValue),
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

  private async applyTenantProfileUpdates(
    currentUser: AuthenticatedUser,
    updates: NormalizedSettingUpdate[],
  ) {
    const displayNameUpdate = updates.find(
      (update) =>
        update.category === 'organization' &&
        update.key === 'tenantDisplayName',
    );

    const data: { name?: string; updatedById: string } = {
      updatedById: currentUser.userId,
    };

    if (displayNameUpdate) {
      const name = toDisplayString(displayNameUpdate.value ?? '').trim();

      if (name.length < 2) {
        throw new BadRequestException(
          'Tenant display name must be at least 2 characters.',
        );
      }

      data.name = name;
    }

    if (data.name === undefined) {
      return false;
    }

    await this.tenantSettingsRepository.updateTenantProfile(
      currentUser.tenantId,
      data,
    );

    return true;
  }

  private async syncTenantBrandingModel(
    tenantId: string,
    updates: NormalizedSettingUpdate[],
  ) {
    const brandingUpdates = updates.filter(
      (update) => update.category === 'branding',
    );

    if (brandingUpdates.length === 0) {
      return;
    }

    const data = brandingUpdates.reduce<Record<string, string | null>>(
      (accumulator, update) => {
        const field = mapBrandingSettingKey(update.key);
        if (!field) {
          return accumulator;
        }

        accumulator[field] =
          update.value === null || update.value === Prisma.JsonNull
            ? null
            : toDisplayString(update.value);
        return accumulator;
      },
      {},
    );

    if (Object.keys(data).length === 0) {
      return;
    }

    await this.tenantSettingsRepository.upsertTenantBranding(tenantId, data);
  }

  private invalidatePublicTenantCacheIfNeeded(
    tenantId: string,
    tenantProfileChanged: boolean,
    updates: NormalizedSettingUpdate[],
  ) {
    const brandingChanged = updates.some(
      (update) => update.category === 'branding',
    );

    if (!tenantProfileChanged && !brandingChanged) {
      return;
    }

    this.publicTenantCacheService.deleteByPrefix('tenant:resolve:');
    this.publicTenantCacheService.delete(`tenant:branding:${tenantId}`);
  }
}

/**
 * The attendance settings the platform mandates, and their mandated values.
 *
 * THIS IS DELIBERATE POLICY, NOT AN OVERSIGHT. Device location capture is an
 * integrity control for every self-service attendance mode. It landed on
 * 2026-07-29 in commit `a8c04f16`, whose migration
 * `20260728234000_attendance_mandatory_location_capture` opens with:
 *
 *   -- Attendance location is a mandatory integrity control for all
 *   -- self-service modes.
 *
 * DO NOT DELETE THIS MAP TO "RESTORE CONFIGURABILITY". It would restore none:
 * the enforcement is `validateAttendanceLocationPayload` in the attendance
 * service, which throws `LOCATION_CAPTURE_REQUIRED` unconditionally and reads
 * no setting at all. Removing the lock would only make these keys start
 * *looking* live while behaving identically. Relaxing the mandate is a change
 * to that enforcement path and to the attendance engine's work-mode
 * derivation, and needs an ExecPlan.
 *
 * These are settings keys. The attendance service holds a related but NOT
 * identical list of resolved policy fields, `MANDATORY_LOCATION_CAPTURE`; the
 * two overlap in five entries and differ in the rest.
 */
const MANDATORY_ATTENDANCE_SETTINGS: Record<
  string,
  Prisma.InputJsonValue | typeof Prisma.JsonNull
> = {
  requireRemoteLocationCapture: true,
  locationCaptureRequired: true,
  locationRequiredForModes: ['OFFICE', 'REMOTE', 'HYBRID'],
  captureLocationOnCheckIn: true,
  captureLocationOnCheckOut: true,
  allowManualLocationException: false,
  highAccuracyLocation: true,
};

/**
 * Refuses a mandated attendance setting instead of silently overruling it.
 *
 * The mandate itself is correct and stays. What was defective was everything
 * around it: the submitted value was replaced with the mandate's before the
 * change-diff ran, so the update was dropped as a no-op. The administrator got
 * a successful save, no warning, an audit row recording no change, and the old
 * value back on reload (BUG-1979).
 *
 * A submission that already matches the mandate is not an error - it is a
 * no-op, and refusing it would break any client that re-sends everything it
 * read. Only a value that differs is refused, and the message names the key.
 */
function assertAttendanceSettingIsChangeable(
  category: string,
  key: string,
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull,
) {
  if (category !== 'attendance') return;

  const mandatoryValue = MANDATORY_ATTENDANCE_SETTINGS[key];
  if (mandatoryValue === undefined) return;

  /* Same normalization the change-diff uses, so an array in a different
   * order is not mistaken for an attempted change. */
  const submitted = JSON.stringify(normalizeComparableValue(value));
  const mandated = JSON.stringify(normalizeComparableValue(mandatoryValue));

  if (submitted !== mandated) {
    throw new BadRequestException({
      code: 'ATTENDANCE_SETTING_ENFORCED_BY_PLATFORM',
      message:
        `attendance.${key} is enforced by platform policy and was not applied. ` +
        `Attendance location capture is mandatory for all self-service modes. ` +
        `No other setting in this submission was saved.`,
    });
  }
}
/**
 * The write-side lock on the mandated attendance settings.
 *
 * Kept even though `assertAttendanceSettingIsChangeable` now refuses a
 * differing value before this runs. The assertion is the disclosure; this is
 * the guarantee - a caller that reaches this normalization by some other route
 * still cannot write past the mandate. It reads the same map so the two can't
 * disagree about which keys are locked.
 */
function enforceCriticalAttendanceSetting(
  category: string,
  key: string,
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull,
) {
  if (category !== 'attendance') return value;

  const mandatoryValue = MANDATORY_ATTENDANCE_SETTINGS[key];
  return mandatoryValue === undefined ? value : mandatoryValue;
}

function mapBrandingSettingKey(key: string) {
  const map: Record<string, string> = {
    logoUrl: 'logoUrl',
    faviconUrl: 'faviconUrl',
    loginBannerImageUrl: 'loginImageUrl',
    loginHeroImageUrl: 'loginImageUrl',
    primaryColor: 'primaryColor',
    secondaryColor: 'secondaryColor',
    accentColor: 'accentColor',
    backgroundColor: 'backgroundColor',
    surfaceColor: 'surfaceColor',
    textColor: 'textColor',
    mutedTextColor: 'mutedTextColor',
    fontFamily: 'fontFamily',
    appTitle: 'appTitle',
    brandName: 'brandName',
    shortBrandName: 'shortBrandName',
    portalTagline: 'portalTagline',
    welcomeTitle: 'loginTitle',
    welcomeSubtitle: 'loginSubtitle',
    footerText: 'loginFooterText',
    supportEmail: 'supportEmail',
    supportPhone: 'supportPhone',
    privacyPolicyUrl: 'privacyPolicyUrl',
    termsOfUseUrl: 'termsOfUseUrl',
  };

  return map[key] ?? null;
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

  if (MULTI_VALUE_SETTING_KEYS.has(`${category}.${key}`)) {
    return normalizeArrayValue(category, key, value);
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

  return toDisplayString(value);
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
