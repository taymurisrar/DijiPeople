-- What the buyer does, carried from checkout to provisioning.
--
-- `CustomerContact` is where a job title belongs, but it does not exist until
-- provisioning runs, so the value has to survive the gap. `CustomerContact.role`
-- is free text and `isPrimaryContact` already carries the relationship, so the
-- role column can hold "HR Director" without losing "this is the primary owner".

-- AlterTable
ALTER TABLE "SubscriptionOrder" ADD COLUMN     "ownerJobTitle" TEXT;
