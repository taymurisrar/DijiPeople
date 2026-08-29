import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AttendanceModule } from '../attendance/attendance.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  /*
   * The work calendar lives in the attendance module, and the dashboard's
   * absent count has to consult it (BUG-2008). Imported rather than re-queried
   * so both screens answer "is today a working day" the same way.
   */
  imports: [JwtModule.register({}), AttendanceModule],
  controllers: [DashboardController],
  providers: [DashboardService, JwtAuthGuard, PermissionsGuard],
})
export class DashboardModule {}
