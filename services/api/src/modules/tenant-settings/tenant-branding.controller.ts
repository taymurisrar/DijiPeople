import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
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
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('tenant-branding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantBrandingController {
  constructor(private readonly service: TenantSettingsService) {}

  @Public()
  @Get('resolved')
  getResolvedPublicBranding(@Query('tenantSlug') tenantSlug?: string) {
    return this.service.getPublicBranding(tenantSlug);
  }

  @Patch()
  @Permissions('branding.manage')
  @RequirePermission(ENTITY_KEYS.BRANDING, 'configure')
  updateBranding(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    if (!dto?.updates?.length) {
      throw new BadRequestException('No branding updates provided');
    }

    return this.service.updateTenantSettingsCategory(user, 'branding', {
      updates: dto.updates.map((update) => ({
        ...update,
        category: 'branding',
      })),
    });
  }
}
