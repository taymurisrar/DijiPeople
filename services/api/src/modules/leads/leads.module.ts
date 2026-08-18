import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { AdminLeadsController } from './admin-leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { PublicLeadsController } from './public-leads.controller';
import { PlatformCommunicationsModule } from '../platform-communications/platform-communications.module';
import { LegalModule } from '../legal/legal.module';

@Module({
  imports: [
    JwtModule.register({}),
    AuditModule,
    PlatformCommunicationsModule,
    LegalModule,
  ],
  controllers: [PublicLeadsController, AdminLeadsController],
  providers: [
    LeadsRepository,
    LeadsService,
    JwtAuthGuard,
    RolesGuard,
    PlatformPermissionsGuard,
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
