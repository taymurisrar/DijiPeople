-- Primary name column per customization module.
--
-- Guarded throughout so it is safe against a fresh database and against one
-- where an earlier attempt already ran.

-- AddColumn
ALTER TABLE "CustomizationColumn" ADD COLUMN IF NOT EXISTS "isPrimaryName" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: choose the column that best names a record, one per table.
--
-- Identifiers are excluded outright. `id` and any `*Id` foreign key are stored
-- as text and are often the first required text column on a table, so a naive
-- ranking picks them — and a lookup would then display a UUID to the user.
-- `tenantId` is excluded for the same reason.
--
-- Beyond that, a column only qualifies if its key actually reads like a name:
-- `name`, the common synonyms, or a `*Name` / `*Code` / `*Title` / `*Number`
-- suffix. An earlier draft fell back to "any required text column" and picked
-- `notes` and `submittedNote` — a lookup showing a paragraph of free text is
-- worse than one showing nothing, because it looks deliberate.
--
-- A table with no naming column gets none. That is the honest result — a join
-- table or an event log has nothing to name a record with, and the API reports
-- an unset primary name rather than inventing a meaningless one.
--
-- Runs only where the table has no primary name yet, so re-running never
-- overrides a choice an administrator has since made.
WITH candidates AS (
  SELECT c."id", c."tenantId", c."tableId", c."columnKey", c."isRequired", c."sortOrder"
  FROM "CustomizationColumn" c
  WHERE c."isActive"
    AND c."dataType" IN ('text', 'email')
    AND c."columnKey" NOT IN ('id', 'tenantId')
    AND c."columnKey" NOT LIKE '%Id'
    AND (
      c."columnKey" IN ('name','displayName','title','fullName','code','label','subject','reference')
      OR c."columnKey" LIKE '%Name'
      OR c."columnKey" LIKE '%Code'
      OR c."columnKey" LIKE '%Title'
      OR c."columnKey" LIKE '%Label'
      OR c."columnKey" LIKE '%Number'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "CustomizationColumn" existing
      WHERE existing."tenantId" = c."tenantId"
        AND existing."tableId" = c."tableId"
        AND existing."isPrimaryName"
    )
),
ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "tableId"
      ORDER BY
        CASE
          WHEN "columnKey" = 'name' THEN 0
          WHEN "columnKey" = 'displayName' THEN 1
          WHEN "columnKey" = 'title' THEN 2
          WHEN "columnKey" = 'fullName' THEN 3
          WHEN "columnKey" = 'code' THEN 4
          WHEN "columnKey" = 'label' THEN 5
          WHEN "columnKey" LIKE '%Name' AND "isRequired" THEN 6
          WHEN "columnKey" LIKE '%Name' THEN 7
          WHEN "columnKey" LIKE '%Title' THEN 8
          WHEN "columnKey" LIKE '%Code' OR "columnKey" LIKE '%Number' THEN 9
          ELSE 10
        END,
        "sortOrder",
        "columnKey"
    ) AS rank
  FROM candidates
)
UPDATE "CustomizationColumn" target
SET "isPrimaryName" = true
FROM ranked
WHERE target."id" = ranked."id" AND ranked.rank = 1;

-- CreateIndex
-- Partial unique index: at most one primary name per table. Prisma cannot
-- express a filtered unique constraint, so it lives here and the schema
-- documents it.
CREATE UNIQUE INDEX IF NOT EXISTS "CustomizationColumn_tenantId_tableId_primaryName_key"
  ON "CustomizationColumn"("tenantId", "tableId")
  WHERE "isPrimaryName";
