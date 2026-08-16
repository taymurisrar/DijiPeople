-- ITEM-0008 — give CustomerAccount an origin channel it owns.
--
-- Partner *attribution* (who gets paid) was already denormalised onto the
-- customer as originatingPartnerId. *Channel* (where they came from) was not, so
-- it was reachable only by joining back through sourceLead, and a customer
-- created without a lead had no channel at all.
--
-- The column is nullable on purpose. The backfill below can classify every
-- customer that still has a lead to read from; it cannot classify one whose lead
-- was deleted (`leadId` is ON DELETE SET NULL). Guessing DIRECT for those would
-- assert something untrue about how they arrived, so they stay NULL — which
-- reads as "not known" rather than as a channel.
CREATE TYPE "CustomerOriginChannel" AS ENUM ('WEBSITE', 'PARTNER_REFERRAL', 'DIRECT', 'OTHER');

ALTER TABLE "CustomerAccount" ADD COLUMN "originChannel" "CustomerOriginChannel";

CREATE INDEX "CustomerAccount_originChannel_idx" ON "CustomerAccount" ("originChannel");

-- Backfill from the originating lead.
--
-- `Lead.source` is admin-editable free text, so only the two values this
-- platform actually issues are mapped. Anything else becomes OTHER rather than
-- being forced into a channel it may not belong to — a customer whose lead
-- source someone typed by hand is genuinely "not one of ours", and saying so is
-- more useful than a confident wrong answer.
UPDATE "CustomerAccount" AS c
SET "originChannel" = CASE
  WHEN lower(l."source") = 'website' THEN 'WEBSITE'::"CustomerOriginChannel"
  WHEN lower(l."source") = 'partner referral' THEN 'PARTNER_REFERRAL'::"CustomerOriginChannel"
  ELSE 'OTHER'::"CustomerOriginChannel"
END
FROM "Lead" AS l
WHERE c."leadId" = l."id"
  AND c."originChannel" IS NULL;

-- A customer with no lead was created directly in the admin console. This is
-- only asserted where the row never had a lead reference at all; a customer
-- whose lead was deleted still has leadId NULL, so this cannot distinguish the
-- two and deliberately does not try — see the note above about staying NULL.
--
-- Left intentionally un-run. Reinstate it only alongside a way to tell
-- "never had a lead" from "lead was deleted", which today's schema does not
-- record.
-- UPDATE "CustomerAccount" SET "originChannel" = 'DIRECT' WHERE "leadId" IS NULL;
