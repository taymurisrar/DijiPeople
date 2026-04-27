import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { AdminLeadsController } from './admin-leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { PublicLeadsController } from './public-leads.controller';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [PublicLeadsController, AdminLeadsController],
  providers: [LeadsRepository, LeadsService, JwtAuthGuard, RolesGuard],
  exports: [LeadsService],
})
export class LeadsModule {}
