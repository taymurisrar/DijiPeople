-- Contract phase — User.identityId becomes required (TASK-0009 WP-09).
--
-- The third and last phase of expand / backfill / contract:
--
--   20260820090000_identity_and_membership_expand   added Identity, nullable FK
--   20260820100000_identity_backfill                filled it, and refused to
--                                                   finish half-linked
--   this                                            makes it required
--
-- WHY THIS WAITED, AND WHY IT CAN RUN NOW.
--
-- It was held deliberately, and not out of caution about the ALTER. The three
-- phases must reach production in *separate deployments*, because after this
-- one a **code** rollback leaves the old build unable to create users at all:
-- it does not write identityId, and the column no longer permits null. A
-- rollback that breaks user creation is worse than whatever it is rolling back
-- from.
--
-- The precondition was that expand and backfill be live in production. They
-- are: `prisma migrate status` against production reported 217 of 217 applied
-- on 2026-08-22, and production `/api/health` reports the commit carrying the
-- Identity model. That check is recorded in the engineering history for that
-- date rather than assumed here.
--
-- THE SAME CONSTRAINT NOW APPLIES TO THIS MIGRATION.
--
-- Once this reaches production, do not roll the API back past the build that
-- writes identityId on every creation path. `user-creation-links-identity.invariant.spec.ts`
-- pins that every path does.

-- Refuse before altering, rather than after.
--
-- `ALTER TABLE ... SET NOT NULL` on a column with nulls fails with a message
-- naming the column and nothing else, which leaves an operator mid-deployment
-- with no idea which rows or how many. The backfill already refuses to finish
-- half-linked, so reaching here with nulls means something wrote a User after
-- it — which is worth saying out loud.
DO $$
DECLARE
    unlinked INTEGER;
BEGIN
    SELECT COUNT(*) INTO unlinked FROM "User" WHERE "identityId" IS NULL;
    IF unlinked > 0 THEN
        RAISE EXCEPTION
            'Cannot make User.identityId required: % row(s) still have none. Re-run the identity backfill, or link them, before deploying the contract phase.',
            unlinked;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "identityId" SET NOT NULL;
