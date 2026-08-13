-- Added in its own migration: PostgreSQL cannot use a newly added enum value in
-- the same transaction that adds it.
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'AGREEMENT' AFTER 'QUALIFIED';
