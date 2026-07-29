-- Payroll cycle boundaries are business dates, not instants. Keeping these as
-- timestamps caused the browser, API and PostgreSQL session timezones to move
-- the displayed day after a save/reload.
ALTER TABLE "PayrollCycle"
  ALTER COLUMN "periodStart" TYPE DATE USING "periodStart"::date,
  ALTER COLUMN "periodEnd" TYPE DATE USING "periodEnd"::date,
  ALTER COLUMN "runDate" TYPE DATE USING "runDate"::date;
