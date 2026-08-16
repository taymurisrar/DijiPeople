-- ITEM-0005 — one lead becomes at most one customer.
--
-- `CustomerAccount.leadId` was a plain nullable FK with a non-unique index, and
-- the "already converted?" pre-check ran OUTSIDE the conversion transaction. Two
-- concurrent conversions of the same lead both passed the check and both created
-- a customer, each carrying its own subscription and invoice.
--
-- This is a destructive-class change in the sense PLANS.md means: it can fail on
-- existing data. So it checks first, and refuses with a message someone can act
-- on rather than a bare index-build error naming nothing.
--
-- The duplicates are NOT resolved here. Choosing which of two real customers
-- survives — each with its own subscription, invoices and possibly a live tenant
-- — is a commercial decision with an owner, not something a migration should
-- pick. If this fires, the listed leads need a human before the deploy proceeds.
DO $$
DECLARE
  duplicate_leads TEXT;
BEGIN
  SELECT string_agg(DISTINCT "leadId", ', ')
  INTO duplicate_leads
  FROM (
    SELECT "leadId"
    FROM "CustomerAccount"
    WHERE "leadId" IS NOT NULL
    GROUP BY "leadId"
    HAVING count(*) > 1
  ) AS duplicated;

  IF duplicate_leads IS NOT NULL THEN
    RAISE EXCEPTION
      'ITEM-0005: cannot add the unique constraint — these leads already have more than one CustomerAccount: %. Decide which customer survives for each, merge or archive the others, then re-run this migration.',
      duplicate_leads;
  END IF;
END $$;

-- NULLs are distinct in a PostgreSQL unique index, so any number of customers
-- created without a lead stay legal. Only a *second* customer for the same lead
-- is refused.
CREATE UNIQUE INDEX "CustomerAccount_leadId_key" ON "CustomerAccount" ("leadId");

DROP INDEX IF EXISTS "CustomerAccount_leadId_idx";
