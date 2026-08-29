-- Scope department name uniqueness to active rows.
--
-- BUG-1958. Deleting a department is a soft delete: `deleteDepartment` sets
-- isActive = false and status = 'INACTIVE' and leaves the row in place. The
-- uniqueness constraint knew nothing about that flag:
--
--   Department_tenantId_name_key
--   UNIQUE ("tenantId", "name")
--
-- so an archived department went on holding its name for ever. A tenant that
-- deleted a department could never create another one by that name, and the
-- 409 it got back blamed a record the product had just told it was deleted.
--
-- What a distinct department name is, after this migration:
--
--   tenant + name, among rows that are still active
--
-- Archived rows keep their names and stay exactly where they are — any number
-- of inactive "Finance" rows may coexist with the one active "Finance" — but
-- they no longer reserve the name against a new one.
--
-- Deliberately NOT changed: Department_tenantId_code_key. `code` is the
-- identity key that provisioning writes through — `seedTenantWorkforceReferenceData`
-- in prisma/seed-config.ts upserts the default departments on
-- `tenantId_code`, on every tenant, on every release. Scoping code uniqueness
-- to active rows would make that upsert miss an archived row and insert a
-- duplicate department each time the seed ran. The name is the human label and
-- is the half this defect is about; the code is the stable key and stays
-- unique across the whole table.
--
-- Nothing is read, moved or deleted here, and no backfill is needed. The
-- partial index covers a strict subset of the rows the old index covered, and
-- those rows already satisfied the stricter constraint, so its creation cannot
-- fail on existing data.
--
-- Rollback is NOT symmetric and that is worth stating: recreating the full
-- unique index would fail once a tenant has taken a name back from an archived
-- department. Reverting therefore means resolving those duplicates first, by
-- renaming the archived rows.

-- Created before the old one is dropped, so there is no window in which two
-- active departments could take the same name.
CREATE UNIQUE INDEX IF NOT EXISTS "Department_active_tenant_name_key"
ON "Department" ("tenantId", "name")
WHERE "isActive" = true;

DROP INDEX IF EXISTS "Department_tenantId_name_key";
