import { Controller, Get, UseGuards } from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationService } from './organization.service';

@Controller('organization-hierarchy')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationHierarchyController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('tree')
  @Permissions('hierarchy.read')
  @RequirePermission(ENTITY_KEYS.HIERARCHY, 'read')
  findHierarchyTree(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.getHierarchyTreeForUser(user);
  }
}
