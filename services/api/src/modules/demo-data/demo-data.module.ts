import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformPermissionsGuard } from '../platform-auth/platform-permissions';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';

@Module({
  controllers: [DemoDataController],
  providers: [
    DemoDataService,
    JwtAuthGuard,
    RolesGuard,
    PlatformPermissionsGuard,
  ],
})
export class DemoDataModule {}
