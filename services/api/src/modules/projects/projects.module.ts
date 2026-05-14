import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [JwtModule.register({}), AuditModule, EmployeesModule],
  controllers: [ProjectsController, CustomersController],
  providers: [
    CustomersService,
    ProjectsRepository,
    ProjectsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
