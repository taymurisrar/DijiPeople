-- CreateEnum
CREATE TYPE "AttendanceProvider" AS ENUM ('ZKTECO', 'HIKVISION', 'SUPREMA', 'GENERIC_REST', 'GENERIC_DATABASE', 'GENERIC_FILE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AttendanceConnectionMode" AS ENUM ('LOCAL_GATEWAY', 'DEVICE_PUSH', 'CLOUD_API', 'VENDOR_SERVER', 'DATABASE', 'FILE_IMPORT');

-- CreateEnum
CREATE TYPE "AttendanceIntegrationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "AttendanceDeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "AttendanceDeviceHealth" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "AttendanceDeviceDirectionMode" AS ENUM ('BOTH', 'ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "AttendanceDeviceScopeType" AS ENUM ('TENANT', 'ORGANIZATION', 'BUSINESS_UNIT', 'DEPARTMENT', 'TEAM', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "AttendanceSyncMode" AS ENUM ('PUSH', 'POLL', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttendanceSyncIntervalUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('DEVICE', 'WEB', 'MOBILE', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkSiteWebAttendancePolicy" AS ENUM ('ALLOWED', 'DISALLOWED', 'FALLBACK_ONLY');

-- CreateEnum
CREATE TYPE "WorkSiteDevicePolicy" AS ENUM ('DEVICE_REQUIRED', 'DEVICE_PREFERRED', 'DEVICE_OPTIONAL');

-- CreateEnum
CREATE TYPE "EmployeeWorkSiteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ExternalIdentityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ExternalUserMappingStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'IGNORED', 'CONFLICT', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeviceProvisioningOperation" AS ENUM ('CREATE_USER', 'UPDATE_USER', 'ENABLE_USER', 'DISABLE_USER');

-- CreateEnum
CREATE TYPE "DeviceProvisioningStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RawAttendanceCaptureSource" AS ENUM ('DEVICE', 'WEB', 'MOBILE', 'MANUAL', 'API', 'FILE');

-- CreateEnum
CREATE TYPE "RawAttendanceMappingStatus" AS ENUM ('MAPPED', 'UNMAPPED', 'CONFLICT', 'IGNORED');

-- CreateEnum
CREATE TYPE "RawAttendanceProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationRunType" AS ENUM ('ATTENDANCE_PULL', 'USER_DISCOVERY', 'USER_PROVISION', 'HEALTH_CHECK', 'MANUAL_SYNC');

-- CreateEnum
CREATE TYPE "IntegrationRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntegrationGatewayStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE', 'DEGRADED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApplicationPlatform" AS ENUM ('WINDOWS', 'MACOS', 'LINUX');

-- CreateEnum
CREATE TYPE "ApplicationArchitecture" AS ENUM ('X64', 'X86', 'ARM64');

-- CreateEnum
CREATE TYPE "ApplicationReleaseChannel" AS ENUM ('STABLE', 'BETA', 'INTERNAL');

-- AlterEnum
ALTER TYPE "EmployeeWorkMode" ADD VALUE 'FIELD';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "allowedAttendanceMethods" "AttendanceMethod"[],
ADD COLUMN     "attendanceEnabled" BOOLEAN,
ADD COLUMN     "businessUnitId" TEXT,
ADD COLUMN     "devicePolicy" "WorkSiteDevicePolicy",
ADD COLUMN     "maximumAccuracyMeters" INTEGER,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validTo" TIMESTAMP(3),
ADD COLUMN     "webAttendancePolicy" "WorkSiteWebAttendancePolicy",
ADD COLUMN     "webFallbackEnabled" BOOLEAN;

-- CreateTable
CREATE TABLE "IntegrationGateway" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "status" "IntegrationGatewayStatus" NOT NULL DEFAULT 'PENDING',
    "version" TEXT,
    "platform" TEXT,
    "architecture" TEXT,
    "capabilities" JSONB,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "IntegrationGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationGatewayPairingCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedIp" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "IntegrationGatewayPairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSyncPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "mode" "AttendanceSyncMode" NOT NULL DEFAULT 'POLL',
    "intervalValue" INTEGER,
    "intervalUnit" "AttendanceSyncIntervalUnit" NOT NULL DEFAULT 'MINUTES',
    "activeWindowStart" TEXT,
    "activeWindowEnd" TEXT,
    "timezone" TEXT,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 1,
    "retryIntervalValue" INTEGER,
    "retryIntervalUnit" "AttendanceSyncIntervalUnit" NOT NULL DEFAULT 'MINUTES',
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "jitterSeconds" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AttendanceSyncPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "provider" "AttendanceProvider" NOT NULL,
    "connectorType" TEXT NOT NULL,
    "connectionMode" "AttendanceConnectionMode" NOT NULL,
    "status" "AttendanceIntegrationStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncPolicyId" TEXT,
    "gatewayId" TEXT,
    "configuration" JSONB,
    "encryptedConfiguration" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AttendanceIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "provider" "AttendanceProvider" NOT NULL,
    "model" TEXT,
    "serialNumber" TEXT,
    "macAddress" TEXT,
    "firmwareVersion" TEXT,
    "locationId" TEXT,
    "gatewayId" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "machineNumber" INTEGER,
    "timezone" TEXT,
    "directionMode" "AttendanceDeviceDirectionMode" NOT NULL DEFAULT 'BOTH',
    "status" "AttendanceDeviceStatus" NOT NULL DEFAULT 'PENDING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "healthStatus" "AttendanceDeviceHealth" NOT NULL DEFAULT 'UNKNOWN',
    "healthMessage" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "syncPolicyId" TEXT,
    "configuration" JSONB,
    "capabilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AttendanceDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceDeviceScope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scopeType" "AttendanceDeviceScopeType" NOT NULL,
    "organizationId" TEXT,
    "businessUnitId" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "employeeId" TEXT,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AttendanceDeviceScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkSite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmployeeWorkSiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeWorkSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeExternalIdentity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "provider" "AttendanceProvider" NOT NULL,
    "integrationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "externalUserId" TEXT NOT NULL,
    "externalEmployeeCode" TEXT,
    "externalName" TEXT,
    "status" "ExternalIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "mappingSource" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "EmployeeExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalDeviceUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "provider" "AttendanceProvider" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "externalName" TEXT,
    "externalEmployeeCode" TEXT,
    "privilegeRaw" INTEGER,
    "isEnabledOnDevice" BOOLEAN,
    "mappingStatus" "ExternalUserMappingStatus" NOT NULL DEFAULT 'UNMATCHED',
    "mappedEmployeeId" TEXT,
    "matchReason" TEXT,
    "conflictReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ExternalDeviceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceProvisioningJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "operation" "DeviceProvisioningOperation" NOT NULL,
    "status" "DeviceProvisioningStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "resultExternalUserId" TEXT,
    "correlationId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DeviceProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawAttendanceEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT,
    "deviceId" TEXT,
    "provider" "AttendanceProvider",
    "externalEventId" TEXT,
    "externalUserId" TEXT,
    "employeeId" TEXT,
    "occurredAtLocal" TEXT NOT NULL,
    "occurredAtUtc" TIMESTAMP(3),
    "deviceTimezone" TEXT,
    "verificationModeRaw" INTEGER,
    "punchStateRaw" INTEGER,
    "workCodeRaw" INTEGER,
    "captureSource" "RawAttendanceCaptureSource" NOT NULL,
    "workMode" "EmployeeWorkMode",
    "locationId" TEXT,
    "eventFingerprint" TEXT NOT NULL,
    "mappingStatus" "RawAttendanceMappingStatus" NOT NULL DEFAULT 'UNMAPPED',
    "processingStatus" "RawAttendanceProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawAttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "deviceId" TEXT,
    "runType" "IntegrationRunType" NOT NULL,
    "status" "IntegrationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsNew" INTEGER NOT NULL DEFAULT 0,
    "recordsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "recordsMapped" INTEGER NOT NULL DEFAULT 0,
    "recordsUnmapped" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationRelease" (
    "id" TEXT NOT NULL,
    "appKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "platform" "ApplicationPlatform" NOT NULL,
    "architecture" "ApplicationArchitecture" NOT NULL,
    "channel" "ApplicationReleaseChannel" NOT NULL DEFAULT 'STABLE',
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "fileName" TEXT,
    "fileSizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "minimumSupportedVersion" TEXT,
    "releaseNotes" TEXT,
    "requiredPermission" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ApplicationRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationGateway_tenantId_idx" ON "IntegrationGateway"("tenantId");

-- CreateIndex
CREATE INDEX "IntegrationGateway_tenantId_status_idx" ON "IntegrationGateway"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IntegrationGateway_tenantId_lastHeartbeatAt_idx" ON "IntegrationGateway"("tenantId", "lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGateway_tenantId_name_key" ON "IntegrationGateway"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGateway_tenantId_code_key" ON "IntegrationGateway"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGatewayPairingCode_codeHash_key" ON "IntegrationGatewayPairingCode"("codeHash");

-- CreateIndex
CREATE INDEX "IntegrationGatewayPairingCode_tenantId_gatewayId_idx" ON "IntegrationGatewayPairingCode"("tenantId", "gatewayId");

-- CreateIndex
CREATE INDEX "IntegrationGatewayPairingCode_expiresAt_idx" ON "IntegrationGatewayPairingCode"("expiresAt");

-- CreateIndex
CREATE INDEX "AttendanceSyncPolicy_tenantId_idx" ON "AttendanceSyncPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceSyncPolicy_tenantId_isActive_idx" ON "AttendanceSyncPolicy"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSyncPolicy_tenantId_name_key" ON "AttendanceSyncPolicy"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSyncPolicy_tenantId_code_key" ON "AttendanceSyncPolicy"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AttendanceIntegration_tenantId_idx" ON "AttendanceIntegration"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceIntegration_tenantId_status_idx" ON "AttendanceIntegration"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AttendanceIntegration_tenantId_provider_idx" ON "AttendanceIntegration"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "AttendanceIntegration_tenantId_gatewayId_idx" ON "AttendanceIntegration"("tenantId", "gatewayId");

-- CreateIndex
CREATE INDEX "AttendanceIntegration_tenantId_syncPolicyId_idx" ON "AttendanceIntegration"("tenantId", "syncPolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceIntegration_tenantId_name_key" ON "AttendanceIntegration"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceIntegration_tenantId_code_key" ON "AttendanceIntegration"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AttendanceDevice_tenantId_idx" ON "AttendanceDevice"("tenantId");

-- CreateIndex
CREATE INDEX "AttendanceDevice_tenantId_integrationId_idx" ON "AttendanceDevice"("tenantId", "integrationId");

-- CreateIndex
CREATE INDEX "AttendanceDevice_tenantId_locationId_idx" ON "AttendanceDevice"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "AttendanceDevice_tenantId_gatewayId_idx" ON "AttendanceDevice"("tenantId", "gatewayId");

-- CreateIndex
CREATE INDEX "AttendanceDevice_tenantId_status_isEnabled_idx" ON "AttendanceDevice"("tenantId", "status", "isEnabled");

-- CreateIndex
CREATE INDEX "AttendanceDevice_tenantId_healthStatus_idx" ON "AttendanceDevice"("tenantId", "healthStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_tenantId_name_key" ON "AttendanceDevice"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_tenantId_code_key" ON "AttendanceDevice"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_tenantId_integrationId_serialNumber_key" ON "AttendanceDevice"("tenantId", "integrationId", "serialNumber");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_deviceId_idx" ON "AttendanceDeviceScope"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_scopeType_idx" ON "AttendanceDeviceScope"("tenantId", "scopeType");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_organizationId_idx" ON "AttendanceDeviceScope"("tenantId", "organizationId");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_businessUnitId_idx" ON "AttendanceDeviceScope"("tenantId", "businessUnitId");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_departmentId_idx" ON "AttendanceDeviceScope"("tenantId", "departmentId");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_teamId_idx" ON "AttendanceDeviceScope"("tenantId", "teamId");

-- CreateIndex
CREATE INDEX "AttendanceDeviceScope_tenantId_employeeId_idx" ON "AttendanceDeviceScope"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkSite_tenantId_employeeId_idx" ON "EmployeeWorkSite"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkSite_tenantId_locationId_idx" ON "EmployeeWorkSite"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "EmployeeWorkSite_tenantId_status_idx" ON "EmployeeWorkSite"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkSite_tenantId_employeeId_locationId_key" ON "EmployeeWorkSite"("tenantId", "employeeId", "locationId");

-- CreateIndex
CREATE INDEX "EmployeeExternalIdentity_tenantId_employeeId_idx" ON "EmployeeExternalIdentity"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeExternalIdentity_tenantId_integrationId_idx" ON "EmployeeExternalIdentity"("tenantId", "integrationId");

-- CreateIndex
CREATE INDEX "EmployeeExternalIdentity_tenantId_deviceId_idx" ON "EmployeeExternalIdentity"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "EmployeeExternalIdentity_tenantId_status_idx" ON "EmployeeExternalIdentity"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EmployeeExternalIdentity_tenantId_externalUserId_idx" ON "EmployeeExternalIdentity"("tenantId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeExternalIdentity_tenantId_integrationId_deviceId_ex_key" ON "EmployeeExternalIdentity"("tenantId", "integrationId", "deviceId", "externalUserId");

-- CreateIndex
CREATE INDEX "ExternalDeviceUser_tenantId_integrationId_idx" ON "ExternalDeviceUser"("tenantId", "integrationId");

-- CreateIndex
CREATE INDEX "ExternalDeviceUser_tenantId_deviceId_idx" ON "ExternalDeviceUser"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "ExternalDeviceUser_tenantId_mappingStatus_idx" ON "ExternalDeviceUser"("tenantId", "mappingStatus");

-- CreateIndex
CREATE INDEX "ExternalDeviceUser_tenantId_mappedEmployeeId_idx" ON "ExternalDeviceUser"("tenantId", "mappedEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalDeviceUser_tenantId_integrationId_deviceId_external_key" ON "ExternalDeviceUser"("tenantId", "integrationId", "deviceId", "externalUserId");

-- CreateIndex
CREATE INDEX "DeviceProvisioningJob_tenantId_status_idx" ON "DeviceProvisioningJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeviceProvisioningJob_tenantId_employeeId_idx" ON "DeviceProvisioningJob"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "DeviceProvisioningJob_tenantId_deviceId_idx" ON "DeviceProvisioningJob"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "DeviceProvisioningJob_tenantId_correlationId_idx" ON "DeviceProvisioningJob"("tenantId", "correlationId");

-- CreateIndex
CREATE INDEX "DeviceProvisioningJob_tenantId_status_nextRetryAt_idx" ON "DeviceProvisioningJob"("tenantId", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "RawAttendanceEvent_tenantId_occurredAtLocal_idx" ON "RawAttendanceEvent"("tenantId", "occurredAtLocal");

-- CreateIndex
CREATE INDEX "RawAttendanceEvent_tenantId_deviceId_occurredAtLocal_idx" ON "RawAttendanceEvent"("tenantId", "deviceId", "occurredAtLocal");

-- CreateIndex
CREATE INDEX "RawAttendanceEvent_tenantId_employeeId_occurredAtLocal_idx" ON "RawAttendanceEvent"("tenantId", "employeeId", "occurredAtLocal");

-- CreateIndex
CREATE INDEX "RawAttendanceEvent_tenantId_processingStatus_idx" ON "RawAttendanceEvent"("tenantId", "processingStatus");

-- CreateIndex
CREATE INDEX "RawAttendanceEvent_tenantId_mappingStatus_idx" ON "RawAttendanceEvent"("tenantId", "mappingStatus");

-- CreateIndex
CREATE INDEX "RawAttendanceEvent_tenantId_externalUserId_idx" ON "RawAttendanceEvent"("tenantId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RawAttendanceEvent_tenantId_captureSource_eventFingerprint_key" ON "RawAttendanceEvent"("tenantId", "captureSource", "eventFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "RawAttendanceEvent_tenantId_integrationId_externalEventId_key" ON "RawAttendanceEvent"("tenantId", "integrationId", "externalEventId");

-- CreateIndex
CREATE INDEX "IntegrationRun_tenantId_integrationId_startedAt_idx" ON "IntegrationRun"("tenantId", "integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_tenantId_deviceId_startedAt_idx" ON "IntegrationRun"("tenantId", "deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_tenantId_status_idx" ON "IntegrationRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IntegrationRun_tenantId_runType_idx" ON "IntegrationRun"("tenantId", "runType");

-- CreateIndex
CREATE INDEX "IntegrationRun_tenantId_correlationId_idx" ON "IntegrationRun"("tenantId", "correlationId");

-- CreateIndex
CREATE INDEX "ApplicationRelease_appKey_isActive_idx" ON "ApplicationRelease"("appKey", "isActive");

-- CreateIndex
CREATE INDEX "ApplicationRelease_appKey_channel_publishedAt_idx" ON "ApplicationRelease"("appKey", "channel", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationRelease_appKey_version_platform_architecture_cha_key" ON "ApplicationRelease"("appKey", "version", "platform", "architecture", "channel");

-- CreateIndex
CREATE INDEX "Location_tenantId_organizationId_idx" ON "Location"("tenantId", "organizationId");

-- CreateIndex
CREATE INDEX "Location_tenantId_businessUnitId_idx" ON "Location"("tenantId", "businessUnitId");

-- CreateIndex
CREATE INDEX "Location_tenantId_attendanceEnabled_idx" ON "Location"("tenantId", "attendanceEnabled");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGateway" ADD CONSTRAINT "IntegrationGateway_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGatewayPairingCode" ADD CONSTRAINT "IntegrationGatewayPairingCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGatewayPairingCode" ADD CONSTRAINT "IntegrationGatewayPairingCode_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IntegrationGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSyncPolicy" ADD CONSTRAINT "AttendanceSyncPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceIntegration" ADD CONSTRAINT "AttendanceIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceIntegration" ADD CONSTRAINT "AttendanceIntegration_syncPolicyId_fkey" FOREIGN KEY ("syncPolicyId") REFERENCES "AttendanceSyncPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceIntegration" ADD CONSTRAINT "AttendanceIntegration_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IntegrationGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AttendanceIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IntegrationGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_syncPolicyId_fkey" FOREIGN KEY ("syncPolicyId") REFERENCES "AttendanceSyncPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Organization"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_businessUnitId_tenantId_fkey" FOREIGN KEY ("businessUnitId", "tenantId") REFERENCES "BusinessUnit"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDeviceScope" ADD CONSTRAINT "AttendanceDeviceScope_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSite" ADD CONSTRAINT "EmployeeWorkSite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSite" ADD CONSTRAINT "EmployeeWorkSite_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkSite" ADD CONSTRAINT "EmployeeWorkSite_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExternalIdentity" ADD CONSTRAINT "EmployeeExternalIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExternalIdentity" ADD CONSTRAINT "EmployeeExternalIdentity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExternalIdentity" ADD CONSTRAINT "EmployeeExternalIdentity_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AttendanceIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExternalIdentity" ADD CONSTRAINT "EmployeeExternalIdentity_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDeviceUser" ADD CONSTRAINT "ExternalDeviceUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDeviceUser" ADD CONSTRAINT "ExternalDeviceUser_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AttendanceIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDeviceUser" ADD CONSTRAINT "ExternalDeviceUser_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDeviceUser" ADD CONSTRAINT "ExternalDeviceUser_mappedEmployeeId_fkey" FOREIGN KEY ("mappedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceProvisioningJob" ADD CONSTRAINT "DeviceProvisioningJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceProvisioningJob" ADD CONSTRAINT "DeviceProvisioningJob_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceProvisioningJob" ADD CONSTRAINT "DeviceProvisioningJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawAttendanceEvent" ADD CONSTRAINT "RawAttendanceEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawAttendanceEvent" ADD CONSTRAINT "RawAttendanceEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AttendanceIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawAttendanceEvent" ADD CONSTRAINT "RawAttendanceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawAttendanceEvent" ADD CONSTRAINT "RawAttendanceEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawAttendanceEvent" ADD CONSTRAINT "RawAttendanceEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AttendanceIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "IntegrationGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Partial unique indexes for integration-scoped (device-less) identities.
--
-- Prisma expresses `@@unique([tenantId, integrationId, deviceId, externalUserId])`,
-- but Postgres treats NULLs as DISTINCT in a unique index. That means the
-- constraint above does not actually prevent two rows with the same
-- (tenantId, integrationId, externalUserId) when deviceId IS NULL — exactly the
-- integration-scoped case, where a connector maps a user once for the whole
-- integration rather than per device.
--
-- These partial indexes close that hole at the database level, so the
-- "one external user id maps to one employee" invariant cannot be violated by a
-- race between two concurrent discovery runs. Prisma cannot generate them, so
-- they are maintained here by hand.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "EmployeeExternalIdentity_tenant_integration_user_no_device_key"
  ON "EmployeeExternalIdentity" ("tenantId", "integrationId", "externalUserId")
  WHERE "deviceId" IS NULL;

CREATE UNIQUE INDEX "ExternalDeviceUser_tenant_integration_user_no_device_key"
  ON "ExternalDeviceUser" ("tenantId", "integrationId", "externalUserId")
  WHERE "deviceId" IS NULL;

-- Same reasoning for device serial numbers: a null serial must not block a
-- second device, but two devices on one integration must not claim the same
-- non-null serial. Prisma's @@unique already allows multiple NULLs, which is the
-- behaviour we want here, so only the documentation differs — no index needed.

-- ---------------------------------------------------------------------------
-- Backfill: give every existing employee who already has a work site an
-- EmployeeWorkSite row.
--
-- Employee.locationId stays the primary/home site and is untouched. Without this
-- backfill, existing employees would have no assignment rows and would be
-- treated as authorised for no work site at all once the new resolution path
-- goes live in Phase 2 — so this is what keeps them usable.
-- ---------------------------------------------------------------------------

INSERT INTO "EmployeeWorkSite" (
  "id", "tenantId", "employeeId", "locationId", "isPrimary", "status",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."tenantId",
  e."id",
  e."locationId",
  true,
  'ACTIVE'::"EmployeeWorkSiteStatus",
  NOW(),
  NOW()
FROM "Employee" e
WHERE e."locationId" IS NOT NULL
ON CONFLICT ("tenantId", "employeeId", "locationId") DO NOTHING;
