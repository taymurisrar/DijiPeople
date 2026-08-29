-- BUG-0084 — pre-check before adding the seven missing unique indexes.
--
-- WHAT THIS IS FOR
-- Seven @@unique / @unique declarations exist in schema.prisma but were never
-- created by any migration. Postgres therefore does not enforce them, and rows
-- that violate them may already exist. CREATE UNIQUE INDEX fails outright on a
-- table holding duplicates, and the migration would run inside Render's
-- preDeployCommand (npm run release:api), so the failure would abort the whole
-- deployment rather than surface in review.
--
-- Run this against production FIRST. It is strictly read-only: no DDL, no DML,
-- no locks beyond an ordinary sequential read.
--
-- HOW TO READ THE RESULT
--   duplicate_groups = 0 for all seven -> the phase 2 migration in
--                                         EXECPLAN-0028 is safe to deploy.
--   duplicate_groups > 0 for any row   -> that constraint needs its dedupe
--                                         decision (phase 1b) first. Do NOT
--                                         deploy until every row reads 0.
--
-- NULL SEMANTICS, which change the answer
-- Postgres treats NULLs as distinct in a unique index, so rows with a NULL in
-- any indexed column can never collide. PartnerPortalUser.invitationTokenHash
-- is the one nullable column among the seven and its check excludes NULLs
-- accordingly; counting them would invent duplicates the index would allow.
--
-- Derived statically by services/api/src/common/prisma/schema-unique-drift.ts,
-- which reproduces the same seven the original prisma migrate diff found on
-- 2026-08-20.

-- ---------------------------------------------------------------------------
-- SUMMARY — one row per constraint. This is the query to run and report back.
-- ---------------------------------------------------------------------------

SELECT 'HolidayCalendar_tenantId_name_key' AS constraint_name,
       'HolidayCalendar(tenantId, name)'   AS target,
       COUNT(*)                            AS duplicate_groups,
       COALESCE(SUM(n) - COUNT(*), 0)      AS surplus_rows
FROM (SELECT COUNT(*) AS n
      FROM "HolidayCalendar"
      GROUP BY "tenantId", "name"
      HAVING COUNT(*) > 1) d

UNION ALL
SELECT 'PartnerOnboardingApplication_invitationTokenHash_key',
       'PartnerOnboardingApplication(invitationTokenHash)',
       COUNT(*), COALESCE(SUM(n) - COUNT(*), 0)
FROM (SELECT COUNT(*) AS n
      FROM "PartnerOnboardingApplication"
      GROUP BY "invitationTokenHash"
      HAVING COUNT(*) > 1) d

UNION ALL
SELECT 'PartnerOnboardingSubmission_applicationId_version_key',
       'PartnerOnboardingSubmission(applicationId, version)',
       COUNT(*), COALESCE(SUM(n) - COUNT(*), 0)
FROM (SELECT COUNT(*) AS n
      FROM "PartnerOnboardingSubmission"
      GROUP BY "applicationId", "version"
      HAVING COUNT(*) > 1) d

UNION ALL
-- Nullable column: NULLs are distinct to a unique index, so they are excluded.
SELECT 'PartnerPortalUser_invitationTokenHash_key',
       'PartnerPortalUser(invitationTokenHash) WHERE NOT NULL',
       COUNT(*), COALESCE(SUM(n) - COUNT(*), 0)
FROM (SELECT COUNT(*) AS n
      FROM "PartnerPortalUser"
      WHERE "invitationTokenHash" IS NOT NULL
      GROUP BY "invitationTokenHash"
      HAVING COUNT(*) > 1) d

UNION ALL
SELECT 'PlatformApprovalRequest_requestNumber_key',
       'PlatformApprovalRequest(requestNumber)',
       COUNT(*), COALESCE(SUM(n) - COUNT(*), 0)
FROM (SELECT COUNT(*) AS n
      FROM "PlatformApprovalRequest"
      GROUP BY "requestNumber"
      HAVING COUNT(*) > 1) d

UNION ALL
SELECT 'PlatformApprovalStep_approvalRequestId_stepOrder_key',
       'PlatformApprovalStep(approvalRequestId, stepOrder)',
       COUNT(*), COALESCE(SUM(n) - COUNT(*), 0)
FROM (SELECT COUNT(*) AS n
      FROM "PlatformApprovalStep"
      GROUP BY "approvalRequestId", "stepOrder"
      HAVING COUNT(*) > 1) d

UNION ALL
SELECT 'SupportCaseIncident_supportCaseId_errorLogId_key',
       'SupportCaseIncident(supportCaseId, errorLogId)',
       COUNT(*), COALESCE(SUM(n) - COUNT(*), 0)
FROM (SELECT COUNT(*) AS n
      FROM "SupportCaseIncident"
      GROUP BY "supportCaseId", "errorLogId"
      HAVING COUNT(*) > 1) d

ORDER BY duplicate_groups DESC, constraint_name;


-- ---------------------------------------------------------------------------
-- DETAIL — run only for a constraint the summary reported above zero, to see
-- which rows collide and decide what to keep.
-- ---------------------------------------------------------------------------

-- 1. HolidayCalendar (tenantId, name)
--    Read the scope columns before deciding anything. The service does NOT
--    enforce name uniqueness per tenant: assertNoOverlappingHolidayCalendar
--    (enterprise-configuration.service.ts:2263) checks scope + effective-date
--    overlap, not the name, so two calendars named "Standard Calendar" under
--    different business units are legitimate configuration today. If the
--    duplicates differ in organizationId / businessUnitId / projectId, the
--    schema declaration is wrong and the fix is to drop it from the schema --
--    not to delete a tenant's calendar.
SELECT h."tenantId", h."name", COUNT(*) AS rows,
       ARRAY_AGG(h."id"             ORDER BY h."createdAt") AS ids,
       ARRAY_AGG(h."code"           ORDER BY h."createdAt") AS codes,
       ARRAY_AGG(h."organizationId" ORDER BY h."createdAt") AS organization_ids,
       ARRAY_AGG(h."businessUnitId" ORDER BY h."createdAt") AS business_unit_ids,
       ARRAY_AGG(h."projectId"      ORDER BY h."createdAt") AS project_ids,
       ARRAY_AGG(h."date"           ORDER BY h."createdAt") AS legacy_dates,
       ARRAY_AGG(h."status"         ORDER BY h."createdAt") AS statuses
FROM "HolidayCalendar" h
GROUP BY h."tenantId", h."name"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 2. PartnerOnboardingApplication (invitationTokenHash)
--    A sha256 of a random token. A hit here means token reuse, not a hash
--    collision -- investigate before deleting anything.
SELECT a."invitationTokenHash", COUNT(*) AS rows,
       ARRAY_AGG(a."id"        ORDER BY a."createdAt") AS ids,
       ARRAY_AGG(a."partnerId" ORDER BY a."createdAt") AS partner_ids,
       ARRAY_AGG(a."status"    ORDER BY a."createdAt") AS statuses
FROM "PartnerOnboardingApplication" a
GROUP BY a."invitationTokenHash"
HAVING COUNT(*) > 1;

-- 3. PartnerOnboardingSubmission (applicationId, version)
--    nextVersion is computed by reading the latest submission OUTSIDE the
--    transaction (partner-experience.service.ts:568), so a double-submit can
--    genuinely produce two rows at the same version. Renumbering by submission
--    time is the safe remediation; deleting a submission loses partner data.
SELECT s."applicationId", s."version", COUNT(*) AS rows,
       ARRAY_AGG(s."id"          ORDER BY s."submittedAt") AS ids,
       ARRAY_AGG(s."submittedAt" ORDER BY s."submittedAt") AS submitted_at
FROM "PartnerOnboardingSubmission" s
GROUP BY s."applicationId", s."version"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 4. PartnerPortalUser (invitationTokenHash), NULLs excluded
SELECT u."invitationTokenHash", COUNT(*) AS rows,
       ARRAY_AGG(u."id"        ORDER BY u."createdAt") AS ids,
       ARRAY_AGG(u."email"     ORDER BY u."createdAt") AS emails,
       ARRAY_AGG(u."status"    ORDER BY u."createdAt") AS statuses,
       ARRAY_AGG(u."partnerId" ORDER BY u."createdAt") AS partner_ids
FROM "PartnerPortalUser" u
WHERE u."invitationTokenHash" IS NOT NULL
GROUP BY u."invitationTokenHash"
HAVING COUNT(*) > 1;

-- 5. PlatformApprovalRequest (requestNumber)
--    Generated as APR-YYYYMMDD-<4 random bytes> by reference()
--    (contracts.service.ts:5730), so a duplicate is a genuine collision or a
--    replayed create. The surviving row should be the one with steps/actions.
SELECT r."requestNumber", COUNT(*) AS rows,
       ARRAY_AGG(r."id"         ORDER BY r."createdAt") AS ids,
       ARRAY_AGG(r."contractId" ORDER BY r."createdAt") AS contract_ids,
       ARRAY_AGG(r."status"     ORDER BY r."createdAt") AS statuses,
       ARRAY_AGG(r."createdAt"  ORDER BY r."createdAt") AS created_at
FROM "PlatformApprovalRequest" r
GROUP BY r."requestNumber"
HAVING COUNT(*) > 1;

-- 6. PlatformApprovalStep (approvalRequestId, stepOrder)
SELECT s."approvalRequestId", s."stepOrder", COUNT(*) AS rows,
       ARRAY_AGG(s."id"     ORDER BY s."createdAt") AS ids,
       ARRAY_AGG(s."name"   ORDER BY s."createdAt") AS names,
       ARRAY_AGG(s."status" ORDER BY s."createdAt") AS statuses
FROM "PlatformApprovalStep" s
GROUP BY s."approvalRequestId", s."stepOrder"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 7. SupportCaseIncident (supportCaseId, errorLogId)
--    The one with a known mechanism. supportCaseId_errorLogId is used by
--    supportCaseIncident.upsert (support-cases.service.ts:389); with no
--    constraint present Prisma emits SELECT-then-INSERT instead of ON CONFLICT,
--    so two concurrent links to the same error log both insert. Duplicates here
--    are link rows only -- no case or error-log data is lost by keeping the
--    earliest and deleting the rest.
SELECT i."supportCaseId", i."errorLogId", COUNT(*) AS rows,
       ARRAY_AGG(i."id"        ORDER BY i."createdAt") AS ids,
       ARRAY_AGG(i."createdAt" ORDER BY i."createdAt") AS created_at
FROM "SupportCaseIncident" i
GROUP BY i."supportCaseId", i."errorLogId"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
