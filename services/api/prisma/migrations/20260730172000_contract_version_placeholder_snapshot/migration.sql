ALTER TABLE "ContractVersion"
ADD COLUMN "placeholderSnapshot" JSONB,
ADD COLUMN "placeholderSnapshotSha256" VARCHAR(64);

CREATE INDEX "ContractVersion_placeholderSnapshotSha256_idx"
ON "ContractVersion"("placeholderSnapshotSha256");
