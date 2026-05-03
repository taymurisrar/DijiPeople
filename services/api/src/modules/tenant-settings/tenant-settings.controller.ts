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
import { TenantSettingsService } from './tenant-settings.service';

const SETTINGS_READ_PERMISSION = 'settings.read';
const SETTINGS_UPDATE_PERMISSION = 'settings.update';

@Controller('tenant-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}

  @Get()
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTenantSettings(user.tenantId);
  }

  @Get('resolved')
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getResolvedSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getResolvedSettings(user.tenantId);
  }

  @Public()
  @Get('public-branding')
  async getPublicBranding(@Query('tenantSlug') tenantSlug?: string) {
    if (!tenantSlug) {
      throw new BadRequestException('tenantSlug is required');
    }

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

  @Get('features')
  @Permissions(SETTINGS_READ_PERMISSION)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async getFeatures(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTenantFeatures(user.tenantId);
  }

  @Get('features/availability')
  async getFeatureAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTenantFeatures(user.tenantId);
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
