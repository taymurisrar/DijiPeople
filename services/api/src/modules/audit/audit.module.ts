import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuditController],
  providers: [AuditRepository, AuditService, JwtAuthGuard, PermissionsGuard],
  exports: [AuditService],
})
export class AuditModule {}
