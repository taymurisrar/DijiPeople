import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantDomainService } from './tenant-domain.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceResolutionService } from './workspace-resolution.service';

/**
 * Hostname rules, available everywhere without creating import cycles.
 *
 * Global because provisioning, the control plane, public tenant resolution and
 * the email/invitation paths all need workspace URLs, and every one of them
 * would otherwise be tempted to build the hostname itself.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [WorkspaceController],
  providers: [TenantDomainService, WorkspaceResolutionService, JwtAuthGuard],
  exports: [TenantDomainService, WorkspaceResolutionService],
})
export class TenantDomainsModule {}
