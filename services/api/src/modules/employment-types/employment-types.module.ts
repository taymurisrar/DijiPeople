import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EmploymentTypesController } from './employment-types.controller';
import { EmploymentTypesService } from './employment-types.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [EmploymentTypesController],
  providers: [EmploymentTypesService],
  exports: [EmploymentTypesService],
})
export class EmploymentTypesModule {}
