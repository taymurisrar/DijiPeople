-- Additive: a workflow run where some actions succeeded and others failed was
-- recorded as SUCCEEDED. The new value lets the runtime say so. Existing rows
-- are untouched; no backfill is possible because the partial outcome was never
-- stored separately.
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'PARTIALLY_FAILED';
