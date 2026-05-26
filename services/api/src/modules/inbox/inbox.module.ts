import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  controllers: [InboxController],
  providers: [InboxService, JwtAuthGuard, PermissionsGuard],
  exports: [InboxService],
})
export class InboxModule {}
