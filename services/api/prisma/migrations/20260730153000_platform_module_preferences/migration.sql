CREATE TABLE "PlatformModulePreference" (
  "id" TEXT NOT NULL,
  "platformUserId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "defaultViewKey" TEXT,
  "selectedViewKey" TEXT,
  "tableStateJson" JSONB,
  "dashboardLayoutJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformModulePreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformModulePreference_platformUserId_moduleKey_key" ON "PlatformModulePreference"("platformUserId", "moduleKey");
CREATE INDEX "PlatformModulePreference_moduleKey_defaultViewKey_idx" ON "PlatformModulePreference"("moduleKey", "defaultViewKey");
ALTER TABLE "PlatformModulePreference" ADD CONSTRAINT "PlatformModulePreference_platformUserId_fkey" FOREIGN KEY ("platformUserId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
