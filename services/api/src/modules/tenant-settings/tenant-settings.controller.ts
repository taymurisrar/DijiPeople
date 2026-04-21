import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { UpdateTenantFeaturesDto } from './dto/update-tenant-features.dto';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('tenant-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Get()
  @Permissions('settings.read')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantSettingsService.getTenantSettings(user.tenantId);
  }

  @Get('resolved')
  @Permissions('settings.read')
  getResolvedSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantSettingsService.getResolvedSettings(user.tenantId);
  }

  @Public()
  @Get('public-branding')
  getPublicBranding(@Query('tenantSlug') tenantSlug?: string) {
    return this.tenantSettingsService.getPublicBranding(tenantSlug);
  }

  @Patch()
  @Permissions('settings.update')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantSettingsService.updateTenantSettings(user, dto);
  }

  @Get('features')
  @Permissions('settings.read')
  getFeatures(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantSettingsService.getTenantFeatures(user.tenantId);
  }

  @Get('features/availability')
  getFeatureAvailability(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantSettingsService.getTenantFeatures(user.tenantId);
  }

  @Patch('features')
  @Permissions('settings.update')
  updateFeatures(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantFeaturesDto,
  ) {
    return this.tenantSettingsService.updateTenantFeatures(user, dto);
  }

  @Get(':category')
  @Permissions('settings.read')
  getSettingsByCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
  ) {
    return this.tenantSettingsService.getTenantSettingsCategory(
      user.tenantId,
      category,
    );
  }

  @Patch(':category')
  @Permissions('settings.update')
  updateSettingsCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantSettingsService.updateTenantSettingsCategory(
      user,
      category,
      dto,
    );
  }
}
