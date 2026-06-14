import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { DemoDataService } from './demo-data.service';

@Controller('admin/demo-data')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformPermissionsGuard)
@RequireRoles('SUPER_ADMIN')
export class DemoDataController {
  constructor(private readonly demoDataService: DemoDataService) {}

  @Get('summary')
  getSummary() {
    return this.demoDataService.getSummary();
  }

  @Delete()
  delete(@CurrentUser() user: AuthenticatedUser) {
    return this.demoDataService.delete(user);
  }

  @Post('reseed')
  reseed(@CurrentUser() user: AuthenticatedUser) {
    return this.demoDataService.reseed(user);
  }
}
