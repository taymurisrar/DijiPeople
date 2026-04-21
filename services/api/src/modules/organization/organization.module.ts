import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DepartmentsController } from './departments.controller';
import { DesignationsController } from './designations.controller';
import { LocationsController } from './locations.controller';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    DepartmentsController,
    DesignationsController,
    LocationsController,
  ],
  providers: [
    OrganizationRepository,
    OrganizationService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [OrganizationRepository, OrganizationService],
})
export class OrganizationModule {}
