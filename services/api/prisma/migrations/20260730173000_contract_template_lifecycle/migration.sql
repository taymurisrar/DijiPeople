ALTER TABLE "ContractTemplate"
ADD COLUMN "archivedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "ContractTemplate_contractType_isActive_idx";
CREATE INDEX "ContractTemplate_contractType_isActive_archivedAt_idx"
ON "ContractTemplate"("contractType", "isActive", "archivedAt");
