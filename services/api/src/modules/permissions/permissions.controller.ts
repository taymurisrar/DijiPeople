import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('permissions.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.findByTenant(user.tenantId);
  }

  @Get('catalog')
  @RequirePermissions('permissions.read')
  getCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.findByTenant(user.tenantId);
  }
}
