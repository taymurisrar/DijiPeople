import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationAccessService } from './organization-access.service';

@Controller('organization-access')
@UseGuards(JwtAuthGuard)
export class OrganizationAccessController {
  constructor(
    private readonly organizationAccessService: OrganizationAccessService,
  ) {}

  @Get('me')
  async getMyAccess(@CurrentUser() user: AuthenticatedUser) {
    const context =
      await this.organizationAccessService.resolveBusinessUnitAccessContext(
        user.userId,
      );

    return {
      userId: context.userId,
      tenantId: context.tenantId,
      businessUnitId: context.businessUnitId,
      organizationId: context.organizationId,
      effectiveAccessLevel: context.effectiveAccessLevel,
      requiresSelfScope: context.requiresSelfScope,
      accessibleBusinessUnitIds: context.accessibleBusinessUnitIds,
      accessibleUserIds: context.accessibleUserIds,
    };
  }
}
