import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [DashboardController],
  providers: [DashboardService, JwtAuthGuard, PermissionsGuard],
})
export class DashboardModule {}
