import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { DemoDataService } from './demo-data.service';

@Controller('admin/demo-data')
/*
 * ADR-0018: `platform.demoData.delete`, which only `platform.*` holds, is the
 * whole requirement. The `@RequireRoles('SUPER_ADMIN')` this carried admitted the
 * same two roles (SUPER_ADMIN, and PLATFORM_OWNER through its alias), so
 * removing it changes nobody's access and leaves one decision instead of two.
 */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
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
