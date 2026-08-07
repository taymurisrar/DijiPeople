import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { StorageModule } from '../../common/storage/storage.module';
import { DataManagementController } from './data-management.controller';
import { ImportAnalysisService } from './import-analysis.service';
import { DataModuleRegistryService } from './module-registry.service';
import { DataTemplateService } from './template.service';

@Module({
  imports: [JwtModule.register({}), StorageModule],
  controllers: [DataManagementController],
  providers: [
    DataModuleRegistryService,
    DataTemplateService,
    ImportAnalysisService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [DataModuleRegistryService],
})
export class DataManagementModule {}
