import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationService } from './organization.service';

@Controller('organization-hierarchy')
@UseGuards(JwtAuthGuard)
export class OrganizationHierarchyController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('tree')
  findHierarchyTree(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.getHierarchyTree(user.tenantId);
  }
}
