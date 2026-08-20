-- Backfill: one Identity per distinct email, linking every workspace account.
--
-- BACKFILL PHASE of expand / backfill / contract. The expand migration
-- (20260820090000) added Identity and the nullable User.identityId; this fills
-- them; the contract phase (WP-09) makes identityId required and takes the
-- credentials off User. Three deployments, because a single one cannot be
-- rolled back and cannot be applied to a populated database.
--
-- WHICH CREDENTIAL SURVIVES.
--
-- The owner decided that the same email in two tenants is one person
-- (ITEM-0062, 2026-08-19). That decision has a consequence nobody stated: when
-- two User rows for one email carry *different* password hashes, linking them
-- to one Identity means one of those passwords stops working.
--
-- It is not hypothetical. Measured read-only against the development database
-- immediately before writing this: 19 users, 14 distinct emails, 5 emails in
-- more than one tenant — and **four of those five carry two different hashes**.
-- All five are @dijipeople.local seed identities and no real customer shares an
-- email today, which is the argument for doing this now rather than later.
--
-- passwordChangedAt cannot break the tie: it is identical across both rows of
-- every duplicate, because the seed set them together. lastLoginAt can, and it
-- gives the rule its justification — **keep the credential the person most
-- recently signed in with successfully.** That is the one they are most likely
-- to still know, and the only tie-break that is about the human rather than
-- about row order.
--
-- Ordering is fully deterministic, so this produces the same result on every
-- environment: lastLoginAt, then passwordChangedAt, then createdAt, all
-- descending with NULLS LAST. No ORDER BY clause here can end in a tie, because
-- createdAt is effectively unique per row.
--
-- LOCKOUT IS CARRIED FORWARD AT ITS MOST RESTRICTIVE.
--
-- MAX(failedLoginAttempts) and MAX(lockedUntil) across the merged rows, not the
-- chosen row's values. Someone locked out at one workspace must not be handed a
-- clean slate by a migration — the merge is not a reason to forgive an attack
-- in progress. Nothing reads these until the auth split lands, so this is
-- setting a correct starting state rather than changing behaviour today.
--
-- Deliberately NOT carried forward: User.status. It stays per tenant, because
-- being disabled at one workspace says nothing about the others. Identity.status
-- defaults to ACTIVE and only an operator suspends a person globally.
--
-- RE-RUNNABLE. ON CONFLICT DO NOTHING on the unique email, and the UPDATE only
-- touches rows still NULL. Running this twice changes nothing the first run did.

-- Create one Identity per distinct normalised email.
--
-- lower(trim(email)) matches `normalizeEmail`, which the login path has always
-- applied before looking a user up — so this groups exactly the rows that
-- already resolved to the same person at sign-in.
INSERT INTO "Identity" (
    "id",
    "email",
    "passwordHash",
    "passwordChangedAt",
    "failedLoginAttempts",
    "lockedUntil",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    chosen."email",
    chosen."passwordHash",
    chosen."passwordChangedAt",
    chosen."mergedFailedAttempts",
    chosen."mergedLockedUntil",
    chosen."earliestCreatedAt",
    NOW()
FROM (
    SELECT DISTINCT ON (lower(trim(u."email")))
        lower(trim(u."email")) AS "email",
        u."passwordHash",
        u."passwordChangedAt",
        -- Window functions are evaluated before DISTINCT ON picks its row, so
        -- these see every row for the email, not only the chosen one.
        MAX(u."failedLoginAttempts") OVER (PARTITION BY lower(trim(u."email"))) AS "mergedFailedAttempts",
        MAX(u."lockedUntil")         OVER (PARTITION BY lower(trim(u."email"))) AS "mergedLockedUntil",
        MIN(u."createdAt")           OVER (PARTITION BY lower(trim(u."email"))) AS "earliestCreatedAt"
    FROM "User" u
    ORDER BY
        lower(trim(u."email")),
        u."lastLoginAt"       DESC NULLS LAST,
        u."passwordChangedAt" DESC NULLS LAST,
        u."createdAt"         DESC
) AS chosen
ON CONFLICT ("email") DO NOTHING;

-- Link every workspace account to its person.
UPDATE "User" u
SET "identityId" = i."id"
FROM "Identity" i
WHERE lower(trim(u."email")) = i."email"
  AND u."identityId" IS NULL;

-- Refuse to finish having half-linked the data.
--
-- Every User has a non-null email and the INSERT above covers every distinct
-- normalised email, so a leftover means an assumption broke — most plausibly an
-- email that normalises to empty. Failing the deployment is correct: the
-- contract phase in WP-09 makes identityId NOT NULL, and it would fail then
-- instead, further from the cause and after another release had shipped.
DO $$
DECLARE
    unlinked INTEGER;
BEGIN
    SELECT COUNT(*) INTO unlinked FROM "User" WHERE "identityId" IS NULL;
    IF unlinked > 0 THEN
        RAISE EXCEPTION
            'Identity backfill left % User row(s) unlinked. Every User must resolve to an Identity before the contract phase can run.',
            unlinked;
    END IF;
END $$;
