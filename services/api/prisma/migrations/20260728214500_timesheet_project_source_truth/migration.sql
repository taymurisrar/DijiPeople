UPDATE "TimesheetEntry" AS entry
SET
  "projectAssignmentId" = assignment.id,
  "billableFlag" = assignment."billableFlag",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ProjectAssignment" AS assignment
WHERE entry."tenantId" = assignment."tenantId"
  AND entry."employeeId" = assignment."employeeId"
  AND entry."projectId" = assignment."projectId";

UPDATE "TimesheetEntry" AS entry
SET
  "billableFlag" = project."billingType" <> 'NON_BILLABLE'::"ProjectBillingType",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Project" AS project
WHERE entry."tenantId" = project."tenantId"
  AND entry."projectId" = project.id
  AND entry."projectAssignmentId" IS NULL;

DELETE FROM "TimesheetEntry"
WHERE "hours" = 0
  AND "projectId" IS NULL
  AND COALESCE("note", '') = ''
  AND COALESCE("description", '') = ''
  AND "source" IN (
    'MANUAL'::"TimesheetEntrySource",
    'SYSTEM'::"TimesheetEntrySource"
  );
