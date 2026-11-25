-- DP-MASTER/WP-03.S2 (A08, A12). Additive: a stable logical key per workflow, an
-- immutable published-version table, and the version a run executed.
-- Legacy rows are migrated, not left behind: every workflow gets a key derived from
-- its name (de-duplicated per tenant) and every ACTIVE workflow gets version 1 equal
-- to what it does today, so existing workflows keep running and their next run records
-- version 1. Nothing is dropped or retyped.

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN "workflowKey" TEXT;
ALTER TABLE "WorkflowRun" ADD COLUMN "workflowVersionId" TEXT;

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- Backfill keys: slug of the name, "-2", "-3" ... for duplicates within a tenant.
WITH base AS (
  SELECT "id", "tenantId", "createdAt",
         COALESCE(NULLIF(trim(both '-' from left(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), 60)), ''), 'workflow') AS slug
  FROM "Workflow"
), ranked AS (
  SELECT "id", slug, row_number() OVER (PARTITION BY "tenantId", slug ORDER BY "createdAt", "id") AS n FROM base
)
UPDATE "Workflow" w
   SET "workflowKey" = CASE WHEN r.n = 1 THEN r.slug ELSE r.slug || '-' || r.n END
  FROM ranked r WHERE w."id" = r."id";

-- A name like "A 2" next to two "A" rows yields a-2 twice. Any key still shared after
-- the pass above gets a fragment of its own row id, which cannot collide.
UPDATE "Workflow" w
   SET "workflowKey" = w."workflowKey" || '-' || substr(w."id", 1, 8)
  FROM (
    SELECT "id", row_number() OVER (PARTITION BY "tenantId", "workflowKey" ORDER BY "createdAt", "id") AS n
    FROM "Workflow"
  ) d
 WHERE w."id" = d."id" AND d.n > 1;

-- Backfill version 1 for workflows that are live today.
INSERT INTO "WorkflowVersion" ("id", "tenantId", "workflowId", "version", "definition", "checksum", "publishedAt", "publishedBy")
SELECT gen_random_uuid()::text, w."tenantId", w."id", 1, d.def, md5(d.def::text), now(), w."updatedBy"
FROM "Workflow" w
CROSS JOIN LATERAL (
  SELECT jsonb_build_object(
    'eventCode', w."eventCode",
    'moduleKey', w."moduleKey",
    'scopeKey', w."scopeKey",
    'conditions', CASE WHEN jsonb_typeof(w."conditions") = 'array' THEN w."conditions" ELSE '[]'::jsonb END,
    'actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', a."type", 'sortOrder', a."sortOrder", 'isActive', a."isActive", 'configuration', a."configuration") ORDER BY a."sortOrder")
      FROM "WorkflowAction" a WHERE a."workflowId" = w."id"), '[]'::jsonb)
  ) AS def
) d
WHERE w."status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_tenantId_workflowKey_key" ON "Workflow"("tenantId", "workflowKey");
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_version_key" ON "WorkflowVersion"("workflowId", "version");
CREATE INDEX "WorkflowVersion_tenantId_workflowId_idx" ON "WorkflowVersion"("tenantId", "workflowId");

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
