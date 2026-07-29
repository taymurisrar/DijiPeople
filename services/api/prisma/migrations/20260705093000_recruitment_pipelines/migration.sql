CREATE TABLE "RecruitmentPipeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowBackwardMove" BOOLEAN NOT NULL DEFAULT true,
    "requireRejectReason" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "RecruitmentPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruitmentPipelineStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageKey" "RecruitmentStage" NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "RecruitmentPipelineStage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobOpening" ADD COLUMN "pipelineId" TEXT;

CREATE UNIQUE INDEX "RecruitmentPipeline_tenantId_name_key" ON "RecruitmentPipeline"("tenantId", "name");
CREATE UNIQUE INDEX "RecruitmentPipeline_tenantId_code_key" ON "RecruitmentPipeline"("tenantId", "code");
CREATE INDEX "RecruitmentPipeline_tenantId_idx" ON "RecruitmentPipeline"("tenantId");
CREATE INDEX "RecruitmentPipeline_tenantId_isActive_idx" ON "RecruitmentPipeline"("tenantId", "isActive");
CREATE INDEX "RecruitmentPipeline_tenantId_isDefault_idx" ON "RecruitmentPipeline"("tenantId", "isDefault");

CREATE UNIQUE INDEX "RecruitmentPipelineStage_pipelineId_stageKey_key" ON "RecruitmentPipelineStage"("pipelineId", "stageKey");
CREATE UNIQUE INDEX "RecruitmentPipelineStage_pipelineId_sortOrder_key" ON "RecruitmentPipelineStage"("pipelineId", "sortOrder");
CREATE INDEX "RecruitmentPipelineStage_tenantId_idx" ON "RecruitmentPipelineStage"("tenantId");
CREATE INDEX "RecruitmentPipelineStage_tenantId_pipelineId_idx" ON "RecruitmentPipelineStage"("tenantId", "pipelineId");
CREATE INDEX "RecruitmentPipelineStage_tenantId_stageKey_idx" ON "RecruitmentPipelineStage"("tenantId", "stageKey");

CREATE INDEX "JobOpening_tenantId_pipelineId_idx" ON "JobOpening"("tenantId", "pipelineId");

ALTER TABLE "RecruitmentPipeline"
ADD CONSTRAINT "RecruitmentPipeline_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruitmentPipelineStage"
ADD CONSTRAINT "RecruitmentPipelineStage_pipelineId_fkey"
FOREIGN KEY ("pipelineId") REFERENCES "RecruitmentPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobOpening"
ADD CONSTRAINT "JobOpening_pipelineId_fkey"
FOREIGN KEY ("pipelineId") REFERENCES "RecruitmentPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
