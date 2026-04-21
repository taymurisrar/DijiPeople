-- Add job-level match criteria as the source of truth for scoring
ALTER TABLE "JobOpening"
ADD COLUMN "matchCriteria" JSONB;
