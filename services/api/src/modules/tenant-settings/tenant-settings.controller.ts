import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PERMISSION_KEYS } from '../../common/constants/permissions';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { ActiveOrganizationService } from './active-organization.service';
import { TenantSettingsService } from './tenant-settings.service';

const SETTINGS_READ_PERMISSION = 'settings.read';
const SETTINGS_UPDATE_PERMISSION = 'settings.update';

@Controller('tenant-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantSettingsController {
  constructor(
    private readonly service: TenantSettingsService,
    private readonly activeOrganizationService: ActiveOrganizationService,
  ) {}

  @Get()
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTenantSettings(user.tenantId);
  }

  @Get('resolved')
  async getResolvedSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    // Settings admins can preview another organization; everyone else resolves
    // to their own, derived from their business unit.
    const requestedOrganizationId = organizationId?.trim()
      ? await this.service.assertOrganizationInTenant(
          user.tenantId,
          organizationId.trim(),
        )
      : undefined;

    const activeOrganizationId =
      requestedOrganizationId ??
      (await this.activeOrganizationService.resolveForUser(
        user.tenantId,
        user.userId,
      ));

    return this.service.getResolvedSettings(
      user.tenantId,
      activeOrganizationId,
    );
  }

  @Public()
  @Get('public-branding')
  async getPublicBranding(@Query('tenantSlug') tenantSlug?: string) {
    return this.service.getPublicBranding(tenantSlug);
  }

  @Patch()
  @Permissions(SETTINGS_UPDATE_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    if (!dto?.updates?.length) {
      throw new BadRequestException('No updates provided');
    }

    return this.service.updateTenantSettings(user, dto);
  }

  @Get('organizations')
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getBrandableOrganizations(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getBrandableOrganizations(user.tenantId);
  }

  @Get('organizations/:organizationId/settings')
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getOrganizationSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
  ) {
    return this.service.getOrganizationSettingOverrides(
      user.tenantId,
      organizationId,
    );
  }

  @Patch('organizations/:organizationId/settings')
  @Permissions(SETTINGS_UPDATE_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async updateOrganizationSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    if (!dto?.updates?.length) {
      throw new BadRequestException('No updates provided');
    }

    return this.service.updateOrganizationSettings(user, organizationId, dto);
  }

  @Get('features')
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getFeatures(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTenantFeatures(user.tenantId);
  }

  /*
   * The application's own view of which features are switched on. Every
   * authenticated user needs it: the authenticated layout fetches this on each
   * page and passes enabledKeys down to decide what the navigation renders.
   *
   * It declared no permission at all, which made it an unguarded alias for
   * GET /tenant-settings/features above -- PermissionsGuard returns true
   * outright when a handler declares neither permission family, so the same
   * payload was readable without settings.read.
   *
   * settings.read is deliberately not used here. The seeded employee role does
   * not hold it, so requiring it would return 403 to every ordinary user on
   * every page load and silently blank out feature-gated navigation.
   * tenant-settings.resolved.read is the key that already exists for exactly
   * this purpose -- resolved tenant configuration for ordinary application
   * users -- and is seeded to employee, manager, hr and recruiter, as well as
   * being a foundation permission so elevated roles and the tenant owner hold
   * it too. It had no call sites until now.
   *
   * The subscription block is dropped rather than forwarded. It carries
   * finalPrice, currency and billingCycle -- what the tenant pays DijiPeople --
   * which the settings screen behind GET /tenant-settings/features may show to
   * a settings administrator, but which no ordinary employee needs to render a
   * menu. The layout reads only enabledKeys.
   */
  @Get('features/availability')
  @Permissions(PERMISSION_KEYS.TENANT_SETTINGS_RESOLVED_READ)
  async getFeatureAvailability(@CurrentUser() user: AuthenticatedUser) {
    const { items, enabledKeys } = await this.service.getTenantFeatures(
      user.tenantId,
    );

    return { items, enabledKeys };
  }

  @Patch('features')
  @Permissions(SETTINGS_UPDATE_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async updateFeatures(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantFeaturesDto,
  ) {
    return this.service.updateTenantFeatures(user, dto);
  }

  @Get(':category')
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getSettingsByCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
  ) {
    validateCategory(category);

    return this.service.getTenantSettingsCategory(user.tenantId, category);
  }

  @Patch(':category')
  @Permissions(SETTINGS_UPDATE_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async updateSettingsCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    validateCategory(category);

    if (!dto?.updates?.length) {
      throw new BadRequestException('No updates provided');
    }

    return this.service.updateTenantSettingsCategory(user, category, dto);
  }
}

function validateCategory(category: string) {
  if (!category || typeof category !== 'string') {
    throw new BadRequestException('Invalid category');
  }
}
