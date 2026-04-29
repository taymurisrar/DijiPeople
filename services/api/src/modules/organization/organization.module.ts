import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { BusinessUnitsController } from './business-units.controller';
import { DepartmentsController } from './departments.controller';
import { DesignationsController } from './designations.controller';
import { LocationsController } from './locations.controller';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationAccessController } from './organization-access.controller';
import { OrganizationHierarchyController } from './organization-hierarchy.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    OrganizationsController,
    BusinessUnitsController,
    OrganizationHierarchyController,
    DepartmentsController,
    DesignationsController,
    LocationsController,
    OrganizationAccessController,
  ],
  providers: [
    OrganizationRepository,
    OrganizationAccessService,
    OrganizationService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    OrganizationRepository,
    OrganizationAccessService,
    OrganizationService,
  ],
})
export class OrganizationModule {}
