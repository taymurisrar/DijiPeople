ALTER TABLE "EmployeeDevice"
  ADD COLUMN "cameraPermission" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "microphonePermission" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "locationPermission" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "permissionUpdatedAt" TIMESTAMP(3);

ALTER TABLE "AgentTrackingSettings"
  ADD COLUMN "allowCameraAccess" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowMicrophoneAccess" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowLocationAccess" BOOLEAN NOT NULL DEFAULT false;
