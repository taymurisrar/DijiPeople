import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EmployeesModule } from '../employees/employees.module';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [JwtModule.register({}), EmployeesModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsRepository,
    ProjectsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
