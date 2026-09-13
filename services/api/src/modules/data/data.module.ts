import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { EntityPermissionResolver } from './entity-permission.resolver';
import { EntityScopeResolver } from './entity-scope.resolver';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { CustomDataService } from './custom-data.service';
import { AuditModule } from '../audit/audit.module';
import { CustomModuleRuntimeController } from './custom-module-runtime.controller';
import { CustomModuleRuntimeService } from './custom-module-runtime.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    DataController,
    MetadataController,
    CustomModuleRuntimeController,
  ],
  providers: [
    DataService,
    EntityPermissionResolver,
    EntityScopeResolver,
    MetadataService,
    CustomDataService,
    CustomModuleRuntimeService,
  ],
})
export class DataModule {}
