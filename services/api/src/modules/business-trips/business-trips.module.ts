import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { BusinessTripsController } from './business-trips.controller';
import { BusinessTripsService } from './business-trips.service';
import { TravelAllowanceResolverService } from './travel-allowance-resolver.service';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [BusinessTripsController],
  providers: [
    BusinessTripsService,
    TravelAllowanceResolverService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [BusinessTripsService, TravelAllowanceResolverService],
})
export class BusinessTripsModule {}
