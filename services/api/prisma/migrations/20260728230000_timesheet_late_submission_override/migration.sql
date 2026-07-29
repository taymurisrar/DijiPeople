ALTER TABLE "TimesheetWeek"
ADD COLUMN "lateSubmissionOverrideAt" TIMESTAMP(3),
ADD COLUMN "lateSubmissionOverrideById" TEXT,
ADD COLUMN "lateSubmissionOverrideReason" TEXT;
