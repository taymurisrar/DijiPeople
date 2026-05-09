import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantSignupDto } from './dto/tenant-signup.dto';
import { UpdateTenantSlugDto } from './dto/update-tenant-slug.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: TenantSignupDto) {
    return this.tenantsService.signup(dto);
  }

  @Get('current')
  @Permissions('tenant.read')
  findCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.findById(user.tenantId);
  }

  @Patch('current/slug')
  updateCurrentSlug(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTenantSlugDto,
  ) {
    return this.tenantsService.updateCurrentSlug(user, dto);
  }
}
