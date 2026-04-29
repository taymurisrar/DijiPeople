import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { EntityPermissionResolver } from './entity-permission.resolver';
import { EntityScopeResolver } from './entity-scope.resolver';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

@Module({
  imports: [AuthModule],
  controllers: [DataController, MetadataController],
  providers: [
    DataService,
    EntityPermissionResolver,
    EntityScopeResolver,
    MetadataService,
  ],
})
export class DataModule {}
