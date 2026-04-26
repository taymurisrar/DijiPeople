ALTER TABLE "PayrollRecord"
  ADD COLUMN "sourceTimesheetIds" JSONB,
  ADD COLUMN "timesheetSummary" JSONB,
  ADD COLUMN "adjustments" JSONB;
