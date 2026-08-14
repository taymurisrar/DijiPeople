import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AttendanceEngineModule } from '../attendance-engine/attendance-engine.module';
import { SecretEncryptionService } from '../../common/security/secret-encryption.service';
import { AuditModule } from '../audit/audit.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { ConnectorConfigurationValidator } from './connectors/connector-configuration.validator';
import { AttendanceConnectorRegistry } from './connectors/connector.registry';
import { AttendanceConnectorsController } from './connectors/connectors.controller';
import { AttendanceDeviceController } from './devices/attendance-device.controller';
import { AttendanceDeviceService } from './devices/attendance-device.service';
import { GatewayAdminController } from './gateways/gateway-admin.controller';
import { GatewayAuthGuard } from './gateways/gateway-auth.guard';
import { GatewayConfigurationService } from './gateways/gateway-configuration.service';
import { GatewayCredentialService } from './gateways/gateway-credential.service';
import { GatewayRuntimeController } from './gateways/gateway-runtime.controller';
import { GatewayRuntimeService } from './gateways/gateway-runtime.service';
import { GatewayServiceController } from './gateways/gateway-service.controller';
import { AttendanceIntegrationController } from './integrations/attendance-integration.controller';
import { AttendanceIntegrationService } from './integrations/attendance-integration.service';
import { EmployeeMappingService } from './mapping/employee-mapping.service';
import { AttendanceOperationsController } from './operations/attendance-operations.controller';
import { AttendanceOperationsService } from './operations/attendance-operations.service';
import { RawAttendanceIngestionService } from './ingestion/raw-attendance-ingestion.service';
import { ProvisioningPlannerService } from './provisioning/provisioning-planner.service';
import { EmployeeWorkSiteResolver } from './work-sites/employee-work-site-resolver.service';
import { WorkSiteReadinessController } from './work-sites/work-site-readiness.controller';
import { WorkSiteReadinessService } from './work-sites/work-site-readiness.service';

/**
 * Attendance Integration Platform — service layer.
 *
 * Kept separate from the existing `attendance` module on purpose. That module
 * owns calculated attendance (AttendanceEntry, policies, corrections); this one
 * owns sources, devices, identity and raw events. Keeping the boundary sharp is
 * what stops device data leaking into attendance conclusions before the
 * reconciliation engine exists.
 */
@Module({
  imports: [
    PrismaModule,
    TenantSettingsModule,
    AuditModule,
    // For the reconciliation queue only. Ingestion enqueues and returns; it
    // never calculates attendance inline.
    AttendanceEngineModule,
  ],
  controllers: [
    AttendanceConnectorsController,
    AttendanceIntegrationController,
    AttendanceDeviceController,
    AttendanceOperationsController,
    WorkSiteReadinessController,
    GatewayAdminController,
    // Machine-facing. Authenticated by GatewayAuthGuard, never by JwtAuthGuard.
    GatewayServiceController,
    GatewayRuntimeController,
  ],
  providers: [
    AttendanceConnectorRegistry,
    ConnectorConfigurationValidator,
    SecretEncryptionService,
    EmployeeWorkSiteResolver,
    RawAttendanceIngestionService,
    EmployeeMappingService,
    ProvisioningPlannerService,
    AttendanceIntegrationService,
    AttendanceDeviceService,
    AttendanceOperationsService,
    WorkSiteReadinessService,
    GatewayCredentialService,
    GatewayConfigurationService,
    GatewayRuntimeService,
    GatewayAuthGuard,
  ],
  exports: [
    AttendanceConnectorRegistry,
    ConnectorConfigurationValidator,
    EmployeeWorkSiteResolver,
    RawAttendanceIngestionService,
    EmployeeMappingService,
    ProvisioningPlannerService,
    GatewayCredentialService,
    GatewayConfigurationService,
    GatewayRuntimeService,
  ],
})
export class AttendanceIntegrationsModule {}
