import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantSignupDto } from './dto/tenant-signup.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';
import { TenantsService } from './tenants.service';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';

@Controller('tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('signup')
  signup(@Body() dto: TenantSignupDto) {
    return this.tenantsService.signup(dto);
  }

  @Get('current')
  @Permissions('tenant.read')
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  findCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.findById(user.tenantId);
  }

  @Get('current/slug')
  @Permissions('tenant.read')
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'read')
  getCurrentSlug(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.getCurrentSlug(user);
  }

  @Patch('current/slug')
  @Permissions('tenant.update')
  @RequirePermission(ENTITY_KEYS.TENANT_ADMINISTRATION, 'manage')
  updateCurrentSlug(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantSlugDto,
  ) {
    return this.tenantsService.updateCurrentSlug(user, dto);
  }
}
