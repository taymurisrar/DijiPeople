import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ReportsController],
  providers: [ReportsService, JwtAuthGuard, PermissionsGuard],
  exports: [ReportsService],
})
export class ReportsModule {}
