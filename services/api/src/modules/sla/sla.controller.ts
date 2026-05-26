import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { SlaService } from './sla.service';

@Controller('sla')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get('trackings')
  @Permissions('sla.read')
  listTrackings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string>,
  ) {
    return this.slaService.listTrackings(user, query);
  }
}
