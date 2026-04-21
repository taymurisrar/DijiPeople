import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditModule } from '../audit/audit.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';

@Module({
  imports: [JwtModule.register({}), AuditModule, TenantSettingsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsRepository,
    DocumentsService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [DocumentsRepository, DocumentsService],
})
export class DocumentsModule {}
