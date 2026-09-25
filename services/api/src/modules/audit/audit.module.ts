import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { AuditController } from './audit.controller';
import { PlatformAuditController } from './platform-audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuditController, PlatformAuditController],
  providers: [
    AuditRepository,
    AuditService,
    JwtAuthGuard,
    PermissionsGuard,
    PlatformPermissionsGuard,
  ],
  exports: [AuditService],
})
export class AuditModule {}
