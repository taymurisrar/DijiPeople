import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SlaController } from './sla.controller';
import { SlaService } from './sla.service';

@Module({
  controllers: [SlaController],
  providers: [SlaService, JwtAuthGuard, PermissionsGuard],
  exports: [SlaService],
})
export class SlaModule {}
